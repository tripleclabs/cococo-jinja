//
//  Printer.swift
//  CococoJinja
//
//  Copyright Triple C Labs GmbH
//
//  Canonical AST -> string projection. Deterministic, minimally parenthesized.
//  Guarantees (see docs/workflow-expression-dialect.md §5):
//    - parse(print(ast)) ≡ ast        (parens are transparent in the AST)
//    - print(parse(text)) is idempotent (canonical normalization)
//
//  This prints the *expression* form (no surrounding `{{ }}`); the template
//  layer adds those when rendering a stored condition string.
//

import Foundation

enum Printer {
    /// Render an expression to its canonical source form.
    static func print(_ expr: Expr) -> String {
        emit(expr, minContext: 0)
    }

    // MARK: - Precedence

    // Higher binds tighter. Mirrors Parser's ladder.
    private enum Prec {
        static let ternary = 1
        static let or = 2
        static let and = 3
        static let not = 4
        static let comparison = 5
        static let concat = 6
        static let additive = 7
        static let multiplicative = 8
        static let negate = 9
        static let filter = 10
        static let reference = 11
        static let primary = 12
    }

    private static func precedence(of op: BinaryOperator) -> Int {
        switch op {
        case .eq, .neq, .lt, .lte, .gt, .gte, .contains, .notContains: Prec.comparison
        case .concat: Prec.concat
        case .add, .subtract: Prec.additive
        case .multiply, .divide, .floorDivide, .modulo: Prec.multiplicative
        }
    }

    /// Render `expr`, wrapping in parentheses if its own precedence is below the
    /// surrounding `minContext`.
    private static func emit(_ expr: Expr, minContext: Int) -> String {
        let (text, prec) = render(expr)
        return prec < minContext ? "(\(text))" : text
    }

    /// Returns the rendered text and the node's precedence.
    private static func render(_ expr: Expr) -> (String, Int) {
        switch expr {
        case let .literal(value):
            return (renderLiteral(value), Prec.primary)

        case let .reference(segments):
            return (renderReference(segments), Prec.reference)

        case let .unary(op, operand):
            switch op {
            case .not:
                return ("not " + emit(operand, minContext: Prec.not), Prec.not)
            case .negate:
                return ("-" + emit(operand, minContext: Prec.negate), Prec.negate)
            }

        case let .binary(op, lhs, rhs):
            let p = precedence(of: op)
            // Left-associative: left child allowed at this precedence, right child
            // must bind strictly tighter (else it needs parens).
            let left = emit(lhs, minContext: p)
            let right = emit(rhs, minContext: p + 1)
            return ("\(left) \(op.rawValue) \(right)", p)

        case let .logical(op, operands):
            let p = op == .or ? Prec.or : Prec.and
            let keyword = op == .or ? "or" : "and"
            // Operands bind strictly tighter than this level.
            let parts = operands.map { emit($0, minContext: p + 1) }
            return (parts.joined(separator: " \(keyword) "), p)

        case let .conditional(condition, then, otherwise):
            // `then if condition else otherwise` — then/condition at or-level,
            // otherwise stays at ternary level (right-associative chaining).
            let thenText = emit(then, minContext: Prec.or)
            let condText = emit(condition, minContext: Prec.or)
            let elseText = emit(otherwise, minContext: Prec.ternary)
            return ("\(thenText) if \(condText) else \(elseText)", Prec.ternary)

        case let .filter(name, input, arguments):
            let inputText = emit(input, minContext: Prec.filter)
            if arguments.isEmpty {
                return ("\(inputText) | \(name)", Prec.filter)
            }
            let argText = arguments.map { emit($0, minContext: 0) }.joined(separator: ", ")
            return ("\(inputText) | \(name)(\(argText))", Prec.filter)

        case let .arrayLiteral(elements):
            let parts = elements.map { emit($0, minContext: 0) }
            return ("[\(parts.joined(separator: ", "))]", Prec.primary)

        case let .objectLiteral(entries):
            let parts = entries.map { "\(renderKey($0.key)): \(emit($0.value, minContext: 0))" }
            return ("{\(parts.joined(separator: ", "))}", Prec.primary)
        }
    }

    // MARK: - Leaves

    private static func renderLiteral(_ value: JinjaValue) -> String {
        switch value {
        case .null: return "null"
        case let .bool(b): return b ? "true" : "false"
        case let .int(i): return String(i)
        case let .double(d): return String(d)
        case let .string(s): return renderStringLiteral(s)
        case let .date(d):
            // Dates have no source literal syntax; the parser never produces one.
            // Best-effort for programmatically-built ASTs (not round-trippable).
            return renderStringLiteral(JinjaValue.date(d).renderedString())
        case let .array(items):
            let parts = items.map { renderLiteral($0) }
            return "[\(parts.joined(separator: ", "))]"
        case let .object(dict):
            // Sort by key so a literal object prints canonically regardless of the
            // backing dictionary's iteration order.
            let parts = dict.sorted { $0.key < $1.key }
                .map { "\(renderKey($0.key)): \(renderLiteral($0.value))" }
            return "{\(parts.joined(separator: ", "))}"
        }
    }

    private static func renderStringLiteral(_ s: String) -> String {
        var out = "'"
        for ch in s {
            switch ch {
            case "\\": out += "\\\\"
            case "'": out += "\\'"
            case "\n": out += "\\n"
            case "\t": out += "\\t"
            case "\r": out += "\\r"
            default: out.append(ch)
            }
        }
        out += "'"
        return out
    }

    private static func renderReference(_ segments: [PathSegment]) -> String {
        var out = ""
        for (i, segment) in segments.enumerated() {
            switch segment {
            case let .key(name):
                if i == 0 {
                    // Root is always a bare identifier (the parser only makes
                    // references from an identifier root).
                    out += name
                } else if isIdentifier(name) {
                    out += ".\(name)"
                } else {
                    out += "[\(renderStringLiteral(name))]"
                }
            case let .index(n):
                out += "[\(n)]"
            case let .dynamic(expr):
                out += "[\(emit(expr, minContext: 0))]"
            }
        }
        return out
    }

    /// An object/member key prints bare when it's a valid identifier, else quoted.
    private static func renderKey(_ key: String) -> String {
        isIdentifier(key) ? key : renderStringLiteral(key)
    }

    /// Whether `s` lexes as a single identifier token (and isn't a keyword).
    private static func isIdentifier(_ s: String) -> Bool {
        guard let first = s.first, first.isLetter || first == "_" else { return false }
        for ch in s.dropFirst() where !(ch.isLetter || ch.isNumber || ch == "_") {
            return false
        }
        switch s {
        case "true", "false", "null", "none", "and", "or", "not", "in", "if", "else":
            return false
        default:
            return true
        }
    }
}
