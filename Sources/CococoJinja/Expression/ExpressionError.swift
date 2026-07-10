//
//  ExpressionError.swift
//  CococoJinja
//
//  Copyright Triple C Labs GmbH
//

import Foundation

/// An error raised while lexing, parsing, or evaluating a workflow expression.
///
/// This is the engine-level error. The node layer maps it onto `WorkflowError`
/// (e.g. `.conditionEvaluationFailed` / `.transformFailed`) so it integrates with
/// the changeset / `FieldError` path-scoped pattern the UI renders. See
/// `docs/workflow-expression-dialect.md` §11.9.
public struct ExpressionError: Error, LocalizedError, Sendable, Equatable {
    public enum Phase: String, Sendable, Equatable {
        case lex
        case parse
        case evaluate
    }

    public let phase: Phase
    public let message: String

    /// Byte offset into the source where the problem was detected, when known
    /// (lex/parse errors). `nil` for evaluation errors that aren't tied to a span.
    public let offset: Int?

    public init(phase: Phase, message: String, offset: Int? = nil) {
        self.phase = phase
        self.message = message
        self.offset = offset
    }

    public var errorDescription: String? {
        if let offset {
            return "\(phase.rawValue) error at \(offset): \(message)"
        }
        return "\(phase.rawValue) error: \(message)"
    }

    // MARK: - Convenience constructors

    static func lex(_ message: String, at offset: Int) -> ExpressionError {
        ExpressionError(phase: .lex, message: message, offset: offset)
    }

    static func parse(_ message: String, at offset: Int? = nil) -> ExpressionError {
        ExpressionError(phase: .parse, message: message, offset: offset)
    }

    static func evaluate(_ message: String) -> ExpressionError {
        ExpressionError(phase: .evaluate, message: message)
    }
}
