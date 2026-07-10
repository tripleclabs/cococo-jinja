//
//  ExpressionValidator.swift
//  CococoJinja
//
//  Copyright Triple C Labs GmbH
//
//  Static (parse-time) validation of workflow expressions, for editor feedback.
//  Mirrors the Lua validator's shape: a pure, stateless check returning
//  line/column diagnostics — no evaluation, no context, no I/O. See
//  docs/workflow-expression-dialect.md.
//

import Foundation

/// How a source string is interpreted when validating.
public enum ExpressionFormat: String, Codable, Sendable, CaseIterable {
    /// A bare boolean expression, as used by condition/switch/assert.
    case predicate = "PREDICATE"
    /// A `{{ … }}` template / value field (plaintext + expression spans).
    case template = "TEMPLATE"
}

public enum ExpressionDiagnosticSeverity: String, Codable, Sendable, CaseIterable {
    case error = "ERROR"
    case warning = "WARNING"
}

/// One validation diagnostic. `line`/`column` are 1-based; both are `0` when the
/// problem has no specific source location (e.g. an unknown filter name, since
/// the AST does not carry per-node positions).
public struct ExpressionDiagnostic: Codable, Sendable, Equatable {
    public let line: Int
    public let column: Int
    /// 0-based character offset into the source, or `-1` when unavailable.
    public let offset: Int
    public let severity: ExpressionDiagnosticSeverity
    public let message: String
    /// The phase that produced it: `lex`, `parse`, `evaluate`, or `filter`.
    public let phase: String

    public init(
        line: Int,
        column: Int,
        offset: Int,
        severity: ExpressionDiagnosticSeverity,
        message: String,
        phase: String
    ) {
        self.line = line
        self.column = column
        self.offset = offset
        self.severity = severity
        self.message = message
        self.phase = phase
    }
}

public struct ExpressionValidationResult: Codable, Sendable, Equatable {
    /// True iff there are no ERROR-severity diagnostics.
    public let success: Bool
    public let diagnostics: [ExpressionDiagnostic]

    public init(success: Bool, diagnostics: [ExpressionDiagnostic]) {
        self.success = success
        self.diagnostics = diagnostics
    }
}

public enum ExpressionValidator {
    /// Validate a workflow-expression source without evaluating it.
    ///
    /// Checks: lexing + parsing (with precise line/column on failure) and that every
    /// filter name is in the allowlist. Does not catch runtime type errors (those
    /// need a context).
    public static func validate(
        _ source: String,
        format: ExpressionFormat,
        filters: FilterRegistry = .standard
    ) -> ExpressionValidationResult {
        // 1. Parse.
        let expressions: [Expr]
        do {
            switch format {
            case .predicate:
                // A bare predicate, also tolerating a single `{{ … }}` span.
                if let expr = try ExpressionTemplate.singleExpression(in: source) {
                    expressions = [expr]
                } else {
                    expressions = [try Parser.parse(source: source)]
                }
            case .template:
                expressions = try ExpressionTemplate.scan(source).compactMap {
                    if case let .expression(expr) = $0 { return expr }
                    return nil
                }
            }
        } catch let error as ExpressionError {
            return ExpressionValidationResult(
                success: false,
                diagnostics: [diagnostic(from: error, source: source)]
            )
        } catch {
            return ExpressionValidationResult(
                success: false,
                diagnostics: [ExpressionDiagnostic(
                    line: 0, column: 0, offset: -1,
                    severity: .error, message: "\(error)", phase: "parse"
                )]
            )
        }

        // 2. Static filter-name check (parse succeeded).
        let known = filters.names
        var unknown: [String] = []
        for expression in expressions {
            for name in filterNames(in: expression) where !known.contains(name) && !unknown.contains(name) {
                unknown.append(name)
            }
        }
        let diagnostics = unknown.map { name in
            ExpressionDiagnostic(
                line: 0, column: 0, offset: -1,
                severity: .error,
                message: "unknown filter '\(name)'",
                phase: "filter"
            )
        }

        return ExpressionValidationResult(
            success: diagnostics.allSatisfy { $0.severity != .error },
            diagnostics: diagnostics
        )
    }

    // MARK: - Helpers

    private static func diagnostic(from error: ExpressionError, source: String) -> ExpressionDiagnostic {
        if let offset = error.offset {
            let (line, column) = position(of: offset, in: source)
            return ExpressionDiagnostic(
                line: line, column: column, offset: offset,
                severity: .error, message: error.message, phase: error.phase.rawValue
            )
        }
        return ExpressionDiagnostic(
            line: 0, column: 0, offset: -1,
            severity: .error, message: error.message, phase: error.phase.rawValue
        )
    }

    /// Map a 0-based character offset to a 1-based (line, column).
    private static func position(of offset: Int, in source: String) -> (line: Int, column: Int) {
        var line = 1
        var column = 1
        var index = 0
        for character in source {
            if index == offset { break }
            if character == "\n" {
                line += 1
                column = 1
            } else {
                column += 1
            }
            index += 1
        }
        return (line, column)
    }

    /// Collect every filter name referenced anywhere in an expression.
    private static func filterNames(in expr: Expr) -> [String] {
        var names: [String] = []
        func walk(_ e: Expr) {
            switch e {
            case .literal:
                break
            case let .reference(segments):
                for segment in segments {
                    if case let .dynamic(inner) = segment { walk(inner) }
                }
            case let .unary(_, operand):
                walk(operand)
            case let .binary(_, lhs, rhs):
                walk(lhs); walk(rhs)
            case let .logical(_, operands):
                operands.forEach(walk)
            case let .conditional(condition, then, otherwise):
                walk(condition); walk(then); walk(otherwise)
            case let .filter(name, input, arguments):
                names.append(name)
                walk(input)
                arguments.forEach(walk)
            case let .arrayLiteral(elements):
                elements.forEach(walk)
            case let .objectLiteral(entries):
                entries.forEach { walk($0.value) }
            }
        }
        walk(expr)
        return names
    }
}
