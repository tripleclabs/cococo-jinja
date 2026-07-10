//
//  Filters.swift
//  CococoJinja
//
//  Copyright Triple C Labs GmbH
//
//  The standard filter allowlist. Each filter is type-checked and throws a typed
//  ExpressionError on misuse. This is the entire callable surface of the dialect —
//  there are no globals and no user-defined filters. See
//  docs/workflow-expression-dialect.md §8.
//

import Foundation

extension FilterRegistry {
    /// Pulse's standard filter set: scalar/collection helpers plus the structured
    /// filters that absorb the old `$op` transform DSL.
    public static let standard = FilterRegistry([
        // Scalar / collection
        "default": Filters.default,
        "length": Filters.length,
        "min": Filters.min,
        "max": Filters.max,
        "lower": Filters.lower,
        "upper": Filters.upper,
        "trim": Filters.trim,
        "join": Filters.join,
        "abs": Filters.abs,
        "round": Filters.round,
        // Structured (transform DSL replacements)
        "merge": Filters.merge,
        "pick": Filters.pick,
        "omit": Filters.omit,
        "concat": Filters.concat,
    ])
}

enum Filters {

    // MARK: - Argument helpers

    private static func requireArgs(_ args: [JinjaValue], _ count: Int, _ name: String) throws {
        guard args.count == count else {
            throw ExpressionError.evaluate("filter '\(name)' expects \(count) argument(s), got \(args.count)")
        }
    }

    private static func requireString(_ value: JinjaValue, _ name: String) throws -> String {
        guard case let .string(s) = value else {
            throw ExpressionError.evaluate("filter '\(name)' requires a string, got \(value.typeName)")
        }
        return s
    }

    private static func requireObject(_ value: JinjaValue, _ name: String) throws -> [String: JinjaValue] {
        guard case let .object(o) = value else {
            throw ExpressionError.evaluate("filter '\(name)' requires an object, got \(value.typeName)")
        }
        return o
    }

    private static func requireKeyArgs(_ args: [JinjaValue], _ name: String) throws -> [String] {
        try args.map { try requireString($0, name) }
    }

    // MARK: - Scalar / collection filters

    /// `value | default(fallback)` — fallback when the input is null.
    static let `default`: ExpressionFilter = { input, args in
        try requireArgs(args, 1, "default")
        if case .null = input { return args[0] }
        return input
    }

    /// `value | length` — element/character count of an array, object, or string.
    static let length: ExpressionFilter = { input, args in
        try requireArgs(args, 0, "length")
        switch input {
        case let .array(a): return .int(a.count)
        case let .object(o): return .int(o.count)
        case let .string(s): return .int(s.count)
        default:
            throw ExpressionError.evaluate("filter 'length' requires an array, object, or string, got \(input.typeName)")
        }
    }

    /// `array | min` — smallest element by ordered comparison.
    static let min: ExpressionFilter = { input, args in
        try requireArgs(args, 0, "min")
        return try extreme(input, name: "min", keepWhen: .orderedAscending)
    }

    /// `array | max` — largest element by ordered comparison.
    static let max: ExpressionFilter = { input, args in
        try requireArgs(args, 0, "max")
        return try extreme(input, name: "max", keepWhen: .orderedDescending)
    }

    private static func extreme(_ input: JinjaValue, name: String, keepWhen wanted: ComparisonResult) throws -> JinjaValue {
        guard case let .array(items) = input else {
            throw ExpressionError.evaluate("filter '\(name)' requires an array, got \(input.typeName)")
        }
        guard var best = items.first else {
            throw ExpressionError.evaluate("filter '\(name)' requires a non-empty array")
        }
        for item in items.dropFirst() where try JinjaValue.semanticCompare(item, best) == wanted {
            best = item
        }
        return best
    }

    /// `string | lower` / `upper` / `trim`.
    static let lower: ExpressionFilter = { input, args in
        try requireArgs(args, 0, "lower")
        return .string(try requireString(input, "lower").lowercased())
    }
    static let upper: ExpressionFilter = { input, args in
        try requireArgs(args, 0, "upper")
        return .string(try requireString(input, "upper").uppercased())
    }
    static let trim: ExpressionFilter = { input, args in
        try requireArgs(args, 0, "trim")
        return .string(try requireString(input, "trim").trimmingCharacters(in: .whitespacesAndNewlines))
    }

    /// `array | join(sep)` — render elements to strings and join (default sep "").
    static let join: ExpressionFilter = { input, args in
        guard case let .array(items) = input else {
            throw ExpressionError.evaluate("filter 'join' requires an array, got \(input.typeName)")
        }
        let sep: String
        switch args.count {
        case 0: sep = ""
        case 1: sep = try requireString(args[0], "join")
        default: throw ExpressionError.evaluate("filter 'join' expects 0 or 1 argument(s), got \(args.count)")
        }
        return .string(items.map { $0.renderedString() }.joined(separator: sep))
    }

    /// `number | abs`.
    static let abs: ExpressionFilter = { input, args in
        try requireArgs(args, 0, "abs")
        switch input {
        case let .int(i):
            // `Swift.abs(Int.min)` traps — surface it as a typed error instead.
            guard i != Int.min else {
                throw ExpressionError.evaluate("filter 'abs' cannot represent the absolute value of \(i)")
            }
            return .int(Swift.abs(i))
        case let .double(d): return .double(Swift.abs(d))
        default: throw ExpressionError.evaluate("filter 'abs' requires a number, got \(input.typeName)")
        }
    }

    /// `number | round(ndigits=0)` — returns a double (Jinja semantics).
    static let round: ExpressionFilter = { input, args in
        guard let value = input.asDouble else {
            throw ExpressionError.evaluate("filter 'round' requires a number, got \(input.typeName)")
        }
        let digits: Int
        switch args.count {
        case 0: digits = 0
        case 1:
            guard let d = args[0].intValue else {
                throw ExpressionError.evaluate("filter 'round' precision must be an integer")
            }
            digits = d
        default:
            throw ExpressionError.evaluate("filter 'round' expects 0 or 1 argument(s), got \(args.count)")
        }
        let factor = pow(10.0, Double(digits))
        return .double((value * factor).rounded() / factor)
    }

    // MARK: - Structured filters (transform DSL replacements)

    /// `object | merge(other)` — shallow merge; keys in `other` win.
    static let merge: ExpressionFilter = { input, args in
        try requireArgs(args, 1, "merge")
        var base = try requireObject(input, "merge")
        let other = try requireObject(args[0], "merge")
        for (k, v) in other { base[k] = v }
        return .object(base)
    }

    /// `object | pick('a', 'b')` — keep only the listed keys that are present.
    static let pick: ExpressionFilter = { input, args in
        let source = try requireObject(input, "pick")
        let keys = try requireKeyArgs(args, "pick")
        var result: [String: JinjaValue] = [:]
        for key in keys where source[key] != nil {
            result[key] = source[key]
        }
        return .object(result)
    }

    /// `object | omit('a', 'b')` — drop the listed keys.
    static let omit: ExpressionFilter = { input, args in
        var source = try requireObject(input, "omit")
        for key in try requireKeyArgs(args, "omit") {
            source.removeValue(forKey: key)
        }
        return .object(source)
    }

    /// `array | concat(other)` or `string | concat(other)` — concatenation.
    static let concat: ExpressionFilter = { input, args in
        try requireArgs(args, 1, "concat")
        switch (input, args[0]) {
        case let (.array(a), .array(b)):
            return .array(a + b)
        case let (.string(a), .string(b)):
            return .string(a + b)
        default:
            throw ExpressionError.evaluate(
                "filter 'concat' requires two arrays or two strings, got \(input.typeName) and \(args[0].typeName)"
            )
        }
    }
}
