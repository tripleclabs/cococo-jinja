//
//  Interpreter.swift
//  CococoJinja
//
//  Copyright Triple C Labs GmbH
//
//  Tree-walk evaluator: Expr + context -> JinjaValue. Operates on a single
//  context object (`{input, variables, nodes}`); node id-then-name resolution and
//  the explicit `.output` accessor are baked into that snapshot by the caller, so
//  reference evaluation is plain navigation (missing → null, §7).
//
//  Semantics (truthiness, equality, ordering) come from JinjaValue+Semantics.
//  Logical operators and `and`/`or` return booleans (not Python operand values),
//  matching the dialect's condition-first design. See §3/§4.
//

import Foundation

/// Evaluates parsed expressions against a context value under a budget.
public enum Evaluator {
    /// Evaluate `expr` against `context`, using `filters` and bounded by `limits`.
    public static func evaluate(
        _ expr: Expr,
        context: JinjaValue,
        filters: FilterRegistry = FilterRegistry(),
        limits: ExpressionLimits = .standard
    ) throws -> JinjaValue {
        let run = Run(context: context, filters: filters, limits: limits)
        return try run.eval(expr, depth: 0)
    }

    // MARK: - One evaluation run (holds mutable budget counters)

    private final class Run {
        let context: JinjaValue
        let filters: FilterRegistry
        let limits: ExpressionLimits
        var operations = 0

        init(context: JinjaValue, filters: FilterRegistry, limits: ExpressionLimits) {
            self.context = context
            self.filters = filters
            self.limits = limits
        }

        func eval(_ expr: Expr, depth: Int) throws -> JinjaValue {
            if depth > limits.maxDepth {
                throw ExpressionError.evaluate("expression nesting exceeds limit (\(limits.maxDepth))")
            }
            operations += 1
            if operations > limits.maxOperations {
                throw ExpressionError.evaluate("expression evaluation budget exceeded (\(limits.maxOperations) steps)")
            }

            switch expr {
            case let .literal(value):
                return value

            case let .reference(segments):
                return try resolveReference(segments, depth: depth)

            case let .unary(op, operand):
                return try evalUnary(op, operand, depth: depth)

            case let .binary(op, lhs, rhs):
                return try evalBinary(op, lhs, rhs, depth: depth)

            case let .logical(op, operands):
                return try evalLogical(op, operands, depth: depth)

            case let .conditional(condition, then, otherwise):
                let chosen = try eval(condition, depth: depth + 1).isTruthy ? then : otherwise
                return try eval(chosen, depth: depth + 1)

            case let .filter(name, input, arguments):
                return try evalFilter(name, input, arguments, depth: depth)

            case let .arrayLiteral(elements):
                try checkCollectionSize(elements.count)
                return try .array(elements.map { try eval($0, depth: depth + 1) })

            case let .objectLiteral(entries):
                try checkCollectionSize(entries.count)
                var dict: [String: JinjaValue] = [:]
                for entry in entries {
                    dict[entry.key] = try eval(entry.value, depth: depth + 1)
                }
                return .object(dict)
            }
        }

        // MARK: References

        private func resolveReference(_ segments: [PathSegment], depth: Int) throws -> JinjaValue {
            var current = context
            for segment in segments {
                if case .null = current { return .null } // short-circuit on missing
                switch segment {
                case let .key(name):
                    current = current[name] ?? .null
                case let .index(n):
                    current = current[n] ?? .null
                case let .dynamic(expr):
                    let key = try eval(expr, depth: depth + 1)
                    switch key {
                    case let .string(s):
                        current = current[s] ?? .null
                    case let .int(i):
                        current = current[i] ?? .null
                    default:
                        throw ExpressionError.evaluate(
                            "subscript must be a string or integer, got \(key.typeName)"
                        )
                    }
                }
            }
            return current
        }

        // MARK: Unary

        private func evalUnary(_ op: UnaryOperator, _ operand: Expr, depth: Int) throws -> JinjaValue {
            let value = try eval(operand, depth: depth + 1)
            switch op {
            case .not:
                return .bool(!value.isTruthy)
            case .negate:
                switch value {
                case let .int(i):
                    // `-Int.min` traps; report it as a typed error instead.
                    let (negated, overflow) = 0.subtractingReportingOverflow(i)
                    guard !overflow else {
                        throw ExpressionError.evaluate("integer overflow negating \(i)")
                    }
                    return .int(negated)
                case let .double(d): return .double(-d)
                default:
                    throw ExpressionError.evaluate("cannot negate \(value.typeName)")
                }
            }
        }

        // MARK: Logical (boolean, short-circuiting)

        private func evalLogical(_ op: LogicalOperator, _ operands: [Expr], depth: Int) throws -> JinjaValue {
            switch op {
            case .and:
                for operand in operands where try !eval(operand, depth: depth + 1).isTruthy {
                    return .bool(false)
                }
                return .bool(true)
            case .or:
                for operand in operands where try eval(operand, depth: depth + 1).isTruthy {
                    return .bool(true)
                }
                return .bool(false)
            }
        }

        // MARK: Binary

        private func evalBinary(_ op: BinaryOperator, _ lhsExpr: Expr, _ rhsExpr: Expr, depth: Int) throws -> JinjaValue {
            let lhs = try eval(lhsExpr, depth: depth + 1)
            let rhs = try eval(rhsExpr, depth: depth + 1)

            switch op {
            case .eq:
                return .bool(JinjaValue.semanticEquals(lhs, rhs))
            case .neq:
                return .bool(!JinjaValue.semanticEquals(lhs, rhs))
            case .lt:
                return .bool(try JinjaValue.semanticCompare(lhs, rhs) == .orderedAscending)
            case .lte:
                return .bool(try JinjaValue.semanticCompare(lhs, rhs) != .orderedDescending)
            case .gt:
                return .bool(try JinjaValue.semanticCompare(lhs, rhs) == .orderedDescending)
            case .gte:
                return .bool(try JinjaValue.semanticCompare(lhs, rhs) != .orderedAscending)
            case .add, .subtract, .multiply, .divide, .floorDivide, .modulo:
                return try arithmetic(op, lhs, rhs)
            case .concat:
                return try concat(lhs, rhs)
            case .contains:
                return .bool(try membership(element: lhs, collection: rhs))
            case .notContains:
                return .bool(!(try membership(element: lhs, collection: rhs)))
            }
        }

        private func arithmetic(_ op: BinaryOperator, _ lhs: JinjaValue, _ rhs: JinjaValue) throws -> JinjaValue {
            guard lhs.isNumeric, rhs.isNumeric else {
                throw ExpressionError.evaluate(
                    "operator '\(op.rawValue)' requires two numbers, got \(lhs.typeName) and \(rhs.typeName)"
                )
            }
            // Integer fast path keeps ints as ints (except true division).
            if case let .int(a) = lhs, case let .int(b) = rhs {
                switch op {
                case .add:
                    let (r, o) = a.addingReportingOverflow(b)
                    guard !o else { throw ExpressionError.evaluate("integer overflow in \(a) + \(b)") }
                    return .int(r)
                case .subtract:
                    let (r, o) = a.subtractingReportingOverflow(b)
                    guard !o else { throw ExpressionError.evaluate("integer overflow in \(a) - \(b)") }
                    return .int(r)
                case .multiply:
                    let (r, o) = a.multipliedReportingOverflow(by: b)
                    guard !o else { throw ExpressionError.evaluate("integer overflow in \(a) * \(b)") }
                    return .int(r)
                case .divide:
                    guard b != 0 else { throw ExpressionError.evaluate("division by zero") }
                    return .double(Double(a) / Double(b))
                case .floorDivide:
                    guard b != 0 else { throw ExpressionError.evaluate("division by zero") }
                    return .int(Int((Double(a) / Double(b)).rounded(.down)))
                case .modulo:
                    guard b != 0 else { throw ExpressionError.evaluate("division by zero") }
                    // Floored modulo so the result matches `//`'s rounding (the
                    // sign follows the divisor, as in Python/Jinja). `a % -1` is
                    // mathematically 0 but traps via overflow, so short-circuit it.
                    if b == -1 { return .int(0) }
                    let r = a % b
                    let floored = (r != 0 && (r < 0) != (b < 0)) ? r + b : r
                    return .int(floored)
                default: break
                }
            }
            let a = lhs.asDouble!
            let b = rhs.asDouble!
            switch op {
            case .add: return .double(a + b)
            case .subtract: return .double(a - b)
            case .multiply: return .double(a * b)
            case .divide:
                guard b != 0 else { throw ExpressionError.evaluate("division by zero") }
                return .double(a / b)
            case .floorDivide:
                guard b != 0 else { throw ExpressionError.evaluate("division by zero") }
                return .double((a / b).rounded(.down))
            case .modulo:
                guard b != 0 else { throw ExpressionError.evaluate("division by zero") }
                return .double(a.truncatingRemainder(dividingBy: b))
            default:
                throw ExpressionError.evaluate("unsupported arithmetic operator")
            }
        }

        private func concat(_ lhs: JinjaValue, _ rhs: JinjaValue) throws -> JinjaValue {
            let result = lhs.renderedString() + rhs.renderedString()
            if result.count > limits.maxStringLength {
                throw ExpressionError.evaluate("string length exceeds limit (\(limits.maxStringLength))")
            }
            return .string(result)
        }

        private func membership(element: JinjaValue, collection: JinjaValue) throws -> Bool {
            switch collection {
            case let .array(items):
                return items.contains { JinjaValue.semanticEquals($0, element) }
            case let .object(dict):
                guard case let .string(key) = element else {
                    throw ExpressionError.evaluate("'in' on an object requires a string key, got \(element.typeName)")
                }
                return dict[key] != nil
            case let .string(haystack):
                guard case let .string(needle) = element else {
                    throw ExpressionError.evaluate("'in' on a string requires a string, got \(element.typeName)")
                }
                return haystack.contains(needle) || needle.isEmpty
            default:
                throw ExpressionError.evaluate("'in' requires an array, object, or string, got \(collection.typeName)")
            }
        }

        // MARK: Filters

        private func evalFilter(_ name: String, _ inputExpr: Expr, _ argExprs: [Expr], depth: Int) throws -> JinjaValue {
            guard let filter = filters.filter(named: name) else {
                throw ExpressionError.evaluate("unknown filter '\(name)'")
            }
            let input = try eval(inputExpr, depth: depth + 1)
            let args = try argExprs.map { try eval($0, depth: depth + 1) }
            let result = try filter(input, args)
            // Filters (join/concat/merge/…) can grow their output; enforce the same
            // budget the interpreter applies to inline string/collection building.
            try checkValueSize(result)
            return result
        }

        // MARK: Budget helpers

        private func checkCollectionSize(_ count: Int) throws {
            if count > limits.maxCollectionSize {
                throw ExpressionError.evaluate("collection size exceeds limit (\(limits.maxCollectionSize))")
            }
        }

        /// Constrain a produced value to the string-length / collection-size budgets.
        private func checkValueSize(_ value: JinjaValue) throws {
            switch value {
            case let .string(s):
                if s.count > limits.maxStringLength {
                    throw ExpressionError.evaluate("string length exceeds limit (\(limits.maxStringLength))")
                }
            case let .array(a):
                try checkCollectionSize(a.count)
            case let .object(o):
                try checkCollectionSize(o.count)
            default:
                break
            }
        }
    }
}
