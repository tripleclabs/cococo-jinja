//
//  JinjaValue+Semantics.swift
//  CococoJinja
//
//  Copyright Triple C Labs GmbH
//
//  Value semantics for the workflow expression dialect: truthiness, equality,
//  ordered comparison, numeric coercion, and text rendering. These rules are the
//  ratified spec — see docs/workflow-expression-dialect.md §3 and §11.
//

import Foundation

extension JinjaValue {

    // MARK: - Truthiness (§3, ratified)

    /// Whether this value is "truthy" for condition evaluation.
    ///
    /// Falsy: `null`, `false`, `0`, `0.0`, `""`, `[]`, `{}`.
    /// Truthy: everything else, including any `.date`.
    public var isTruthy: Bool {
        switch self {
        case .null: false
        case let .bool(b): b
        case let .int(i): i != 0
        case let .double(d): d != 0
        case let .string(s): !s.isEmpty
        case let .array(a): !a.isEmpty
        case let .object(o): !o.isEmpty
        case .date: true
        }
    }

    // MARK: - Numeric coercion

    /// True if this value is `.int` or `.double`.
    var isNumeric: Bool {
        switch self {
        case .int, .double: true
        default: false
        }
    }

    /// The numeric value as a `Double`, for `.int`/`.double` only. `nil` otherwise.
    ///
    /// (`doubleValue` on `JinjaValue` already promotes `.int`; this is the
    /// expression-engine-local spelling kept beside the other semantics helpers.)
    var asDouble: Double? {
        switch self {
        case let .int(i): Double(i)
        case let .double(d): d
        default: nil
        }
    }

    // MARK: - Equality (§11.4, ratified: numeric equality by value)

    /// Semantic equality as used by the dialect's `==` / `!=` operators.
    ///
    /// Differs from `Equatable` in two ways:
    ///   - Numbers compare by value across `.int`/`.double`: `1 == 1.0` is `true`.
    ///   - Comparison across unrelated types is `false` (never an error):
    ///     `1 == "1"` and `null == 0` are both `false`.
    /// Arrays and objects compare deeply using these same rules.
    public static func semanticEquals(_ lhs: JinjaValue, _ rhs: JinjaValue) -> Bool {
        switch (lhs, rhs) {
        case let (.int(a), .int(b)):
            return a == b
        case (.int, .double), (.double, .int), (.double, .double):
            // At least one double involved — compare as Double.
            return lhs.asDouble == rhs.asDouble
        case let (.string(a), .string(b)):
            return a == b
        case let (.bool(a), .bool(b)):
            return a == b
        case (.null, .null):
            return true
        case let (.date(a), .date(b)):
            return a == b
        case let (.array(a), .array(b)):
            guard a.count == b.count else { return false }
            return zip(a, b).allSatisfy { semanticEquals($0, $1) }
        case let (.object(a), .object(b)):
            guard a.count == b.count else { return false }
            for (key, av) in a {
                guard let bv = b[key], semanticEquals(av, bv) else { return false }
            }
            return true
        default:
            return false
        }
    }

    // MARK: - Ordered comparison (§11.5)

    /// Orders two values for `<`, `<=`, `>`, `>=`.
    ///
    /// Defined only between two numbers, two strings, or two dates. Any other
    /// pairing (mismatched or non-orderable types) throws — surfacing it as an
    /// author error rather than silently coercing.
    public static func semanticCompare(
        _ lhs: JinjaValue,
        _ rhs: JinjaValue
    ) throws -> ComparisonResult {
        if let a = lhs.asDouble, let b = rhs.asDouble {
            // NaN has no ordering; `compareScalars` would silently report
            // `.orderedDescending`. Reject it as an author error instead.
            // (±infinity orders fine, so only NaN is excluded.)
            guard !a.isNaN, !b.isNaN else {
                throw ExpressionError.evaluate("cannot order NaN")
            }
            return compareScalars(a, b)
        }
        switch (lhs, rhs) {
        case let (.string(a), .string(b)):
            if a == b { return .orderedSame }
            return a < b ? .orderedAscending : .orderedDescending
        case let (.date(a), .date(b)):
            return a.compare(b)
        default:
            throw ExpressionError.evaluate(
                "cannot order \(lhs.typeName) and \(rhs.typeName); "
                    + "ordered comparison requires two numbers, two strings, or two dates"
            )
        }
    }

    private static func compareScalars<T: Comparable>(_ a: T, _ b: T) -> ComparisonResult {
        if a == b { return .orderedSame }
        return a < b ? .orderedAscending : .orderedDescending
    }

    // MARK: - Text rendering (§3 / §6 string projection)

    /// How this value renders when interpolated into a template string.
    ///
    /// - null            → ""
    /// - bool            → "true" / "false"
    /// - int             → decimal
    /// - double          → decimal (integral doubles keep a trailing .0)
    /// - string          → the raw string
    /// - date            → ISO8601 (§11.5, ratified)
    /// - array / object  → compact JSON
    public func renderedString() -> String {
        switch self {
        case .null:
            return ""
        case let .bool(b):
            return b ? "true" : "false"
        case let .int(i):
            return String(i)
        case let .double(d):
            return String(d)
        case let .string(s):
            return s
        case let .date(d):
            return JinjaValue.iso8601.string(from: d)
        case .array, .object:
            return (try? toJSONString()) ?? ""
        }
    }

    /// Shared ISO8601 formatter (internet date-time, UTC `Z`).
    ///
    /// `nonisolated(unsafe)`: configured once at init and thereafter only read via
    /// `string(from:)`, which is thread-safe for Foundation formatters on Darwin.
    private nonisolated(unsafe) static let iso8601: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime]
        return f
    }()
}
