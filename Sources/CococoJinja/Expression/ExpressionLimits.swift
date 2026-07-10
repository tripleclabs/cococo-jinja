//
//  ExpressionLimits.swift
//  CococoJinja
//
//  Copyright Triple C Labs GmbH
//
//  Execution budget for expression evaluation. Mirrors the shape of SwiftLua's
//  PulseExecutionLimits: script-reachable code never traps — every limit
//  surfaces as a typed ExpressionError. See docs/workflow-expression-dialect.md §8.
//

import Foundation

public struct ExpressionLimits: Sendable, Equatable {
    /// Maximum AST recursion depth (guards pathological nesting).
    public var maxDepth: Int
    /// Maximum number of evaluation steps (guards expensive/large evaluations).
    public var maxOperations: Int
    /// Maximum length of any produced string (concat / render).
    public var maxStringLength: Int
    /// Maximum element count of any produced collection (array/object building).
    public var maxCollectionSize: Int

    public init(
        maxDepth: Int = 64,
        maxOperations: Int = 10_000,
        maxStringLength: Int = 100_000,
        maxCollectionSize: Int = 10_000
    ) {
        precondition(
            maxDepth > 0 && maxOperations > 0 && maxStringLength > 0 && maxCollectionSize > 0,
            "ExpressionLimits guardrails must all be positive"
        )
        self.maxDepth = maxDepth
        self.maxOperations = maxOperations
        self.maxStringLength = maxStringLength
        self.maxCollectionSize = maxCollectionSize
    }

    /// Pulse's default budget for workflow expressions.
    public static let standard = ExpressionLimits()
}
