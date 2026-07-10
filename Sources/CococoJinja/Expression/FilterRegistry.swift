//
//  FilterRegistry.swift
//  CococoJinja
//
//  Copyright Triple C Labs GmbH
//
//  The filter allowlist — the only callable surface in the dialect. No globals,
//  no user-defined filters, no function/macro values. This is the security
//  boundary. See docs/workflow-expression-dialect.md §8.
//
//  The standard filters themselves live in Filters.swift.
//

import Foundation

/// A filter: transforms an input value given already-evaluated arguments.
public typealias ExpressionFilter = @Sendable (
    _ input: JinjaValue,
    _ arguments: [JinjaValue]
) throws -> JinjaValue

/// An immutable, allowlisted set of filters.
public struct FilterRegistry: Sendable {
    private let filters: [String: ExpressionFilter]

    public init(_ filters: [String: ExpressionFilter] = [:]) {
        self.filters = filters
    }

    public func filter(named name: String) -> ExpressionFilter? {
        filters[name]
    }

    public var names: Set<String> {
        Set(filters.keys)
    }
}
