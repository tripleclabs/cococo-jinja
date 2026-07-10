//
//  JinjaValue+JSON.swift
//  CococoJinja
//
//  Copyright Triple C Labs GmbH
//

import Foundation

extension JinjaValue {

    // MARK: - From Standard JSON

    /// Parse a standard JSON value (Any) into a JinjaValue.
    /// This handles the native JSON types from JSONSerialization.
    ///
    /// `as NSNumber` is matched *before* `as Bool` so that `0` / `1` aren't
    /// silently coerced to `.bool(false)` / `.bool(true)` via NSNumber's
    /// implicit boolValue bridge — see `NSNumberJSONScalar` for the trap.
    public static func fromJSON(_ json: Any) -> JinjaValue {
        switch json {
        case is NSNull:
            return .null
        case let num as NSNumber:
            if NSNumberJSONScalar.isBoolean(num) {
                return .bool(num.boolValue)
            }
            if NSNumberJSONScalar.isFloatType(num) {
                return .double(num.doubleValue)
            }
            return .int(num.intValue)
        case let bool as Bool:
            return .bool(bool)
        case let str as String:
            return .string(str)
        case let arr as [Any]:
            return .array(arr.map { fromJSON($0) })
        case let dict as [String: Any]:
            return .object(dict.mapValues { fromJSON($0) })
        default:
            // Fallback: try to convert to string
            return .string(String(describing: json))
        }
    }

    /// Parse a JSON string into a JinjaValue.
    /// - Parameter jsonString: A valid JSON string
    /// - Returns: The parsed JinjaValue
    /// - Throws: If the string is not valid JSON
    public static func fromJSONString(_ jsonString: String) throws -> JinjaValue {
        guard let data = jsonString.data(using: .utf8) else {
            throw JinjaValueJSONError.invalidUTF8
        }
        let json = try JSONSerialization.jsonObject(with: data, options: [.fragmentsAllowed])
        return fromJSON(json)
    }

    /// Parse JSON Data into a JinjaValue.
    /// - Parameter data: Valid JSON data
    /// - Returns: The parsed JinjaValue
    /// - Throws: If the data is not valid JSON
    public static func fromJSONData(_ data: Data) throws -> JinjaValue {
        let json = try JSONSerialization.jsonObject(with: data, options: [.fragmentsAllowed])
        return fromJSON(json)
    }

    // MARK: - To Standard JSON

    /// Convert to a plain JSON-compatible object graph (`NSNull`/`Bool`/`Int`/
    /// `Double`/`String`/`[Any]`/`[String: Any]`) suitable for `JSONSerialization`.
    public func toJSONLogicValue() -> Any {
        switch self {
        case .null:
            NSNull()
        case let .bool(b):
            b
        case let .int(i):
            i
        case let .double(d):
            d
        case let .string(s):
            s
        case let .array(arr):
            arr.map { $0.toJSONLogicValue() }
        case let .object(obj):
            obj.mapValues { $0.toJSONLogicValue() }
        case let .date(d):
            ISO8601DateFormatter().string(from: d)
        }
    }

    /// Convert JinjaValue to JSON Data.
    public func toJSONData() throws -> Data {
        try JSONSerialization.data(withJSONObject: toJSONLogicValue(), options: [.fragmentsAllowed])
    }

    /// Convert JinjaValue to a JSON string.
    public func toJSONString() throws -> String {
        let data = try toJSONData()
        return String(data: data, encoding: .utf8) ?? "{}"
    }
}

/// Errors that can occur during JSON parsing.
public enum JinjaValueJSONError: Error, Sendable {
    case invalidUTF8
    case invalidJSON(String)
}
