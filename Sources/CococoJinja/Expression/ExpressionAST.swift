//
//  ExpressionAST.swift
//  CococoJinja
//
//  Copyright Triple C Labs GmbH
//
//  The expression AST is the single source of truth for the workflow expression
//  dialect. The stored canonical string and the visual rule-builder are both
//  projections of it. See docs/workflow-expression-dialect.md §2 and §5.
//

import Foundation

/// A parsed workflow expression.
///
/// `indirect` because operators nest. The AST is a strict superset of the
/// builder-editable "rule subset" (§5); anything outside that subset (filters,
/// arithmetic, `~`, ternary, non-scalar literals) is text-only in the UI.
public indirect enum Expr: Sendable, Equatable {
    /// A scalar/collection constant, e.g. `42`, `"hi"`, `true`, `null`.
    case literal(JinjaValue)

    /// A reference into the evaluation context, e.g. `input.age`,
    /// `nodes.n1.output.items[0]`. The root identifier is the first `.key`
    /// segment; resolution semantics (node id-then-name) live in the interpreter.
    case reference([PathSegment])

    /// `not x`, `-x`.
    case unary(UnaryOperator, Expr)

    /// Binary operator over two operands: comparison, arithmetic, `~`, `in`.
    case binary(BinaryOperator, Expr, Expr)

    /// `and` / `or`, kept **n-ary** so a builder AND/OR group with N children
    /// round-trips to a single node (§5). Always has ≥ 2 operands.
    case logical(LogicalOperator, [Expr])

    /// `then if condition else otherwise` (Jinja ternary order).
    case conditional(condition: Expr, then: Expr, otherwise: Expr)

    /// A filter application: `input | name(args...)`. Left-associative chains
    /// nest as `filter(g, filter(f, x))`.
    case filter(name: String, input: Expr, arguments: [Expr])

    /// `[a, b, c]`.
    case arrayLiteral([Expr])

    /// `{ "k": v, ... }`. Order-preserving.
    case objectLiteral([ObjectEntry])
}

/// One `key: value` pair in an object literal. A named struct (not a tuple) so
/// `Expr` keeps automatic `Equatable`/`Sendable` synthesis.
public struct ObjectEntry: Sendable, Equatable {
    public let key: String
    public let value: Expr

    public init(key: String, value: Expr) {
        self.key = key
        self.value = value
    }
}

/// One segment of a reference path.
public enum PathSegment: Sendable, Equatable {
    /// `.foo` or `["foo"]` — a static member name.
    case key(String)
    /// `[0]` — a static array index.
    case index(Int)
    /// `[expr]` — a computed key/index evaluated at runtime.
    case dynamic(Expr)
}

// MARK: - Operators

public enum UnaryOperator: String, Sendable, Equatable {
    case not
    case negate
}

public enum LogicalOperator: String, Sendable, Equatable {
    case and
    case or
}

public enum BinaryOperator: String, Sendable, Equatable {
    // Comparison
    case eq = "=="
    case neq = "!="
    case lt = "<"
    case lte = "<="
    case gt = ">"
    case gte = ">="
    // Arithmetic
    case add = "+"
    case subtract = "-"
    case multiply = "*"
    case divide = "/"
    case floorDivide = "//"
    case modulo = "%"
    // String concatenation
    case concat = "~"
    // Membership
    case contains = "in"
    case notContains = "not in"
}
