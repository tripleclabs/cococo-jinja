//
//  JinjaValueJSONTests.swift
//  CococoJinjaTests
//
//  Copyright Triple C Labs GmbH
//

import CococoJinja
import XCTest

final class JinjaValueJSONTests: XCTestCase {

    // MARK: - fromJSON

    func testFromJSONWithString() {
        let result = JinjaValue.fromJSON("hello" as Any)
        XCTAssertEqual(result, .string("hello"))
    }

    func testFromJSONWithInt() {
        let result = JinjaValue.fromJSON(42 as Any)
        XCTAssertEqual(result, .int(42))
    }

    func testFromJSONWithDouble() {
        let result = JinjaValue.fromJSON(3.14 as Any)
        XCTAssertEqual(result, .double(3.14))
    }

    func testFromJSONWithBool() {
        let trueResult = JinjaValue.fromJSON(true as Any)
        XCTAssertEqual(trueResult, .bool(true))

        let falseResult = JinjaValue.fromJSON(false as Any)
        XCTAssertEqual(falseResult, .bool(false))
    }

    func testFromJSONWithNull() {
        let result = JinjaValue.fromJSON(NSNull() as Any)
        XCTAssertEqual(result, .null)
    }

    func testFromJSONWithArray() {
        let result = JinjaValue.fromJSON([1, "two", true] as Any)
        guard case let .array(arr) = result else {
            XCTFail("Expected array")
            return
        }
        XCTAssertEqual(arr.count, 3)
        XCTAssertEqual(arr[0], .int(1))
        XCTAssertEqual(arr[1], .string("two"))
        XCTAssertEqual(arr[2], .bool(true))
    }

    func testFromJSONWithNestedObject() {
        let jsonDict: [String: Any] = [
            "name": "John",
            "address": [
                "city": "Berlin",
                "zip": "10115",
            ] as [String: Any],
        ]
        let result = JinjaValue.fromJSON(jsonDict)

        guard case let .object(obj) = result else {
            XCTFail("Expected object")
            return
        }
        XCTAssertEqual(obj["name"], .string("John"))

        guard case let .object(address) = obj["address"] else {
            XCTFail("Expected nested object for address")
            return
        }
        XCTAssertEqual(address["city"], .string("Berlin"))
        XCTAssertEqual(address["zip"], .string("10115"))
    }

    // MARK: - fromJSONString

    func testFromJSONStringWithValidJSON() throws {
        let result = try JinjaValue.fromJSONString("{\"name\":\"John\",\"age\":30}")

        guard case let .object(obj) = result else {
            XCTFail("Expected object")
            return
        }
        XCTAssertEqual(obj["name"], .string("John"))
        XCTAssertEqual(obj["age"], .int(30))
    }

    func testFromJSONStringWithInvalidJSONThrows() {
        XCTAssertThrowsError(try JinjaValue.fromJSONString("{not valid}")) { error in
            // Should throw some kind of error (either JinjaValueJSONError or JSONSerialization error)
            XCTAssertNotNil(error)
        }
    }

    // MARK: - toJSONLogicValue

    func testToJSONLogicValueNull() {
        let value: JinjaValue = .null
        let result = value.toJSONLogicValue()
        XCTAssertTrue(result is NSNull)
    }

    func testToJSONLogicValueBool() {
        let value: JinjaValue = .bool(true)
        let result = value.toJSONLogicValue()
        XCTAssertEqual(result as? Bool, true)
    }

    func testToJSONLogicValueInt() {
        let value: JinjaValue = .int(42)
        let result = value.toJSONLogicValue()
        XCTAssertEqual(result as? Int, 42)
    }

    func testToJSONLogicValueDouble() {
        let value: JinjaValue = .double(3.14)
        let result = value.toJSONLogicValue()
        XCTAssertEqual(result as? Double, 3.14)
    }

    func testToJSONLogicValueString() {
        let value: JinjaValue = .string("hello")
        let result = value.toJSONLogicValue()
        XCTAssertEqual(result as? String, "hello")
    }

    func testToJSONLogicValueArray() {
        let value: JinjaValue = .array([.int(1), .string("two")])
        let result = value.toJSONLogicValue()
        guard let arr = result as? [Any] else {
            XCTFail("Expected array")
            return
        }
        XCTAssertEqual(arr.count, 2)
        XCTAssertEqual(arr[0] as? Int, 1)
        XCTAssertEqual(arr[1] as? String, "two")
    }

    func testToJSONLogicValueObject() {
        let value: JinjaValue = .object(["key": .string("value")])
        let result = value.toJSONLogicValue()
        guard let dict = result as? [String: Any] else {
            XCTFail("Expected dictionary")
            return
        }
        XCTAssertEqual(dict["key"] as? String, "value")
    }

    func testToJSONLogicValueDate() {
        let date = Date(timeIntervalSince1970: 1_000_000)
        let value: JinjaValue = .date(date)
        let result = value.toJSONLogicValue()
        guard let dateString = result as? String else {
            XCTFail("Expected ISO8601 string for date")
            return
        }
        // Should produce a valid ISO8601 string
        XCTAssertFalse(dateString.isEmpty)
        let formatter = ISO8601DateFormatter()
        XCTAssertNotNil(formatter.date(from: dateString))
    }

    // MARK: - Round-trips

    func testToJSONDataAndToJSONStringRoundTrip() throws {
        let original: JinjaValue = .object([
            "name": .string("test"),
            "count": .int(42),
            "active": .bool(true),
        ])

        let jsonData = try original.toJSONData()
        XCTAssertFalse(jsonData.isEmpty)

        let jsonString = try original.toJSONString()
        XCTAssertFalse(jsonString.isEmpty)

        // Parse the string back and verify
        let parsed = try JinjaValue.fromJSONString(jsonString)
        guard case let .object(obj) = parsed else {
            XCTFail("Expected object after round-trip")
            return
        }
        XCTAssertEqual(obj["name"], .string("test"))
        XCTAssertEqual(obj["count"], .int(42))
        XCTAssertEqual(obj["active"], .bool(true))
    }
}
