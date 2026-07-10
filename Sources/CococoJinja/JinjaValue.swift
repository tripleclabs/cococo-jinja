//
//  JinjaValue.swift
//  CococoJinja
//
//  Copyright Triple C Labs GmbH
//

import Foundation

/// Dynamic value type for workflow data, similar to JSON.
public enum JinjaValue: Codable, Sendable, Equatable, Hashable {
    case null
    case bool(Bool)
    case int(Int)
    case double(Double)
    case string(String)
    case array([JinjaValue])
    case object([String: JinjaValue])
    case date(Date)

    // MARK: - Convenience Initializers

    public init(_ value: Bool) {
        self = .bool(value)
    }
    public init(_ value: Int) {
        self = .int(value)
    }
    public init(_ value: Double) {
        self = .double(value)
    }
    public init(_ value: String) {
        self = .string(value)
    }
    public init(_ value: [JinjaValue]) {
        self = .array(value)
    }
    public init(_ value: [String: JinjaValue]) {
        self = .object(value)
    }
    public init(_ value: Date) {
        self = .date(value)
    }

    // MARK: - Type Checks

    public var isNull: Bool {
        if case .null = self { return true }
        return false
    }

    public var boolValue: Bool? {
        if case let .bool(v) = self { return v }
        return nil
    }

    public var intValue: Int? {
        if case let .int(v) = self { return v }
        return nil
    }

    public var doubleValue: Double? {
        switch self {
        case let .double(v): v
        case let .int(v): Double(v)
        default: nil
        }
    }

    public var stringValue: String? {
        if case let .string(v) = self { return v }
        return nil
    }

    /// Returns the string value only if it is non-empty, otherwise nil.
    public var nonEmptyStringValue: String? {
        guard case let .string(v) = self, !v.isEmpty else { return nil }
        return v
    }

    public var arrayValue: [JinjaValue]? {
        if case let .array(v) = self { return v }
        return nil
    }

    public var objectValue: [String: JinjaValue]? {
        if case let .object(v) = self { return v }
        return nil
    }

    public var dateValue: Date? {
        if case let .date(v) = self { return v }
        return nil
    }

    /// The name of this value's type, for error messages and debugging.
    public var typeName: String {
        switch self {
        case .null: "null"
        case .bool: "bool"
        case .int: "int"
        case .double: "double"
        case .string: "string"
        case .array: "array"
        case .object: "object"
        case .date: "date"
        }
    }

    // MARK: - Subscript Access

    public subscript(key: String) -> JinjaValue? {
        guard case let .object(dict) = self else { return nil }
        return dict[key]
    }

    public subscript(index: Int) -> JinjaValue? {
        guard case let .array(arr) = self, index >= 0, index < arr.count else { return nil }
        return arr[index]
    }

    // MARK: - Path-based Access

    /// Access nested values using dot notation path (e.g., "user.name" or "items.0.id")
    public func get(path: String) -> JinjaValue? {
        let components = path.split(separator: ".").map(String.init)
        var current: JinjaValue = self

        for component in components {
            if let index = Int(component) {
                guard let next = current[index] else { return nil }
                current = next
            } else {
                guard let next = current[component] else { return nil }
                current = next
            }
        }

        return current
    }

    // MARK: - Codable
    //
    // Wire format is PLAIN JSON: a `JinjaValue` encodes as its natural JSON
    // value (`"x"`, `5`, `true`, `[...]`, `{...}`, `null`) — matching the
    // advertised workflow JSON schema, so external systems can author/consume it.
    // Fidelity policy (ratified): integral numbers normalise to `.int`, and
    // `.date` encodes as an ISO8601 string and is NOT re-parsed on decode (plain
    // strings stay `.string`; add a filter/parse step if a real `.date` is needed).

    public func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        switch self {
        case .null: try container.encodeNil()
        case let .bool(v): try container.encode(v)
        case let .int(v): try container.encode(v)
        case let .double(v): try container.encode(v)
        case let .string(v): try container.encode(v)
        case let .array(v): try container.encode(v)
        case let .object(v): try container.encode(v)
        case let .date(v): try container.encode(Self.iso8601Formatter.string(from: v))
        }
    }

    public init(from decoder: Decoder) throws {
        // LEGACY: data written before the plain-JSON cutover used a tagged
        // `{ "type": ..., "value": ... }` envelope. Accept it here so old rows keep
        // reading; persistence layers migrate-on-load by re-encoding plain on save.
        // Remove `decodeLegacyTaggedEnvelope` (and this branch) once all stored
        // workflow data has been migrated — see TAGGED-ENVELOPE-REMOVAL.
        if let legacy = try Self.decodeLegacyTaggedEnvelope(from: decoder) {
            self = legacy
            return
        }

        let container = try decoder.singleValueContainer()
        if container.decodeNil() {
            self = .null
        } else if let v = try? container.decode(Bool.self) {
            self = .bool(v)
        } else if let v = try? container.decode(Int.self) {
            self = .int(v)
        } else if let v = try? container.decode(Double.self) {
            self = .double(v)
        } else if let v = try? container.decode(String.self) {
            self = .string(v)
        } else if let v = try? container.decode([JinjaValue].self) {
            self = .array(v)
        } else if let v = try? container.decode([String: JinjaValue].self) {
            self = .object(v)
        } else {
            throw DecodingError.dataCorrupted(
                DecodingError.Context(
                    codingPath: decoder.codingPath,
                    debugDescription: "value is not a valid JinjaValue (null, bool, number, string, array, or object)"
                )
            )
        }
    }

    /// Shared ISO8601 formatter for `.date` text projection (internet date-time, UTC `Z`).
    /// `nonisolated(unsafe)`: configured once and thereafter only read via
    /// `string(from:)`, which is thread-safe for Foundation formatters on Darwin.
    private nonisolated(unsafe) static let iso8601Formatter: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime]
        return f
    }()

    // MARK: - Legacy tagged-envelope decoding (remove after full migration)

    private enum LegacyCodingKeys: String, CodingKey {
        case type, value
    }

    private enum LegacyValueType: String, Decodable {
        case null, bool, int, double, string, array, object, date
    }

    /// Dynamic key that captures every property name present on a JSON object, so we
    /// can require the legacy envelope's *exact* shape rather than just a `type` key.
    private struct AnyCodingKey: CodingKey {
        let stringValue: String
        init(stringValue: String) { self.stringValue = stringValue }
        var intValue: Int? { nil }
        init?(intValue: Int) { nil }
    }

    /// Decode the pre-cutover tagged `{ type, value }` envelope, or `nil` if the
    /// input is not such an envelope (i.e. it is plain JSON).
    ///
    /// A real envelope has *exactly* `{type}` (for null) or `{type, value}` and its
    /// `type` is one of the known keywords. Requiring that exact key set stops a
    /// schema-valid plain object that merely carries a `type` field (plus other data)
    /// from being misread as legacy. REMOVE this once stored data is fully migrated.
    private static func decodeLegacyTaggedEnvelope(from decoder: Decoder) throws -> JinjaValue? {
        // Reject anything that isn't an object whose keys are exactly {type} or {type,value}.
        guard let anyContainer = try? decoder.container(keyedBy: AnyCodingKey.self) else {
            return nil
        }
        let keys = Set(anyContainer.allKeys.map(\.stringValue))
        guard keys == ["type"] || keys == ["type", "value"] else {
            return nil
        }

        guard let container = try? decoder.container(keyedBy: LegacyCodingKeys.self),
              container.contains(.type),
              let type = try? container.decode(LegacyValueType.self, forKey: .type)
        else {
            return nil
        }
        switch type {
        case .null:
            return .null
        case .bool:
            return try .bool(container.decode(Bool.self, forKey: .value))
        case .int:
            return try .int(container.decode(Int.self, forKey: .value))
        case .double:
            return try .double(container.decode(Double.self, forKey: .value))
        case .string:
            return try .string(container.decode(String.self, forKey: .value))
        case .array:
            return try .array(container.decode([JinjaValue].self, forKey: .value))
        case .object:
            return try .object(container.decode([String: JinjaValue].self, forKey: .value))
        case .date:
            let timestamp = try container.decode(Double.self, forKey: .value)
            return .date(Date(timeIntervalSince1970: timestamp))
        }
    }
}

// MARK: - ExpressibleByLiteral Conformances

extension JinjaValue: ExpressibleByNilLiteral {
    public init(nilLiteral: ()) {
        self = .null
    }
}

extension JinjaValue: ExpressibleByBooleanLiteral {
    public init(booleanLiteral value: Bool) {
        self = .bool(value)
    }
}

extension JinjaValue: ExpressibleByIntegerLiteral {
    public init(integerLiteral value: Int) {
        self = .int(value)
    }
}

extension JinjaValue: ExpressibleByFloatLiteral {
    public init(floatLiteral value: Double) {
        self = .double(value)
    }
}

extension JinjaValue: ExpressibleByStringLiteral {
    public init(stringLiteral value: String) {
        self = .string(value)
    }
}

extension JinjaValue: ExpressibleByArrayLiteral {
    public init(arrayLiteral elements: JinjaValue...) {
        self = .array(elements)
    }
}

extension JinjaValue: ExpressibleByDictionaryLiteral {
    public init(dictionaryLiteral elements: (String, JinjaValue)...) {
        self = .object(Dictionary(uniqueKeysWithValues: elements))
    }
}
