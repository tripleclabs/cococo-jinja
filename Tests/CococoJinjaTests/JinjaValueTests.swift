import Foundation
import Testing

import CococoJinja

@Suite("JinjaValue")
struct JinjaValueTests {

    // MARK: - Codable Roundtrip (all cases)

    @Test("null roundtrips")
    func nullRoundtrip() throws {
        try assertRoundtrip(JinjaValue.null)
    }

    @Test("bool roundtrips")
    func boolRoundtrip() throws {
        try assertRoundtrip(JinjaValue.bool(true))
        try assertRoundtrip(JinjaValue.bool(false))
    }

    @Test("int roundtrips")
    func intRoundtrip() throws {
        try assertRoundtrip(JinjaValue.int(42))
        try assertRoundtrip(JinjaValue.int(-1))
        try assertRoundtrip(JinjaValue.int(0))
    }

    @Test("double roundtrips")
    func doubleRoundtrip() throws {
        try assertRoundtrip(JinjaValue.double(3.14))
    }

    @Test("string roundtrips")
    func stringRoundtrip() throws {
        try assertRoundtrip(JinjaValue.string("hello"))
        try assertRoundtrip(JinjaValue.string(""))
    }

    @Test("array roundtrips")
    func arrayRoundtrip() throws {
        try assertRoundtrip(JinjaValue.array([.int(1), .string("two"), .null]))
    }

    @Test("object roundtrips")
    func objectRoundtrip() throws {
        try assertRoundtrip(JinjaValue.object(["k": .int(1)]))
    }

    @Test("date encodes to an ISO8601 string (lossy by policy)")
    func dateEncodesToISOString() throws {
        // Plain-JSON wire format: a `.date` projects to an ISO8601 string and is NOT
        // re-parsed on decode (plain strings stay `.string`). See JinjaValue Codable.
        let date = Date(timeIntervalSince1970: 1_700_000_000.0)
        let data = try JSONEncoder().encode(JinjaValue.date(date))
        #expect(String(decoding: data, as: UTF8.self) == "\"2023-11-14T22:13:20Z\"")

        let decoded = try JSONDecoder().decode(JinjaValue.self, from: data)
        #expect(decoded == .string("2023-11-14T22:13:20Z"))
    }

    // MARK: - Plain wire format (canonical JSON schema representation)

    @Test("encodes as plain JSON (no {type,value} envelope)")
    func encodesAsPlainJSON() throws {
        func json(_ v: JinjaValue) throws -> String {
            String(decoding: try JSONEncoder().encode(v), as: UTF8.self)
        }
        #expect(try json(.null) == "null")
        #expect(try json(.bool(true)) == "true")
        #expect(try json(.int(42)) == "42")
        #expect(try json(.string("hi")) == "\"hi\"")
        #expect(try json(.array([.int(1), .string("two")])) == "[1,\"two\"]")
        #expect(try json(.object(["k": .int(1)])) == "{\"k\":1}")
    }

    @Test("decodes natural plain JSON")
    func decodesPlainJSON() throws {
        func decode(_ s: String) throws -> JinjaValue {
            try JSONDecoder().decode(JinjaValue.self, from: Data(s.utf8))
        }
        #expect(try decode("null") == .null)
        #expect(try decode("true") == .bool(true))
        #expect(try decode("42") == .int(42))
        #expect(try decode("3.14") == .double(3.14))
        #expect(try decode("\"hi\"") == .string("hi"))
        #expect(try decode("[1,\"two\"]") == .array([.int(1), .string("two")]))
        #expect(try decode("{\"k\":1}") == .object(["k": .int(1)]))
    }

    @Test("integral doubles normalise to int on decode")
    func integralDoublesCollapseToInt() throws {
        let decoded = try JSONDecoder().decode(JinjaValue.self, from: Data("5.0".utf8))
        #expect(decoded == .int(5))
    }

    // MARK: - Legacy tagged-envelope decoding (remove after full migration)

    @Test("decodes legacy tagged {type,value} envelopes")
    func decodesLegacyTaggedEnvelope() throws {
        func decode(_ s: String) throws -> JinjaValue {
            try JSONDecoder().decode(JinjaValue.self, from: Data(s.utf8))
        }
        #expect(try decode(#"{"type":"null"}"#) == .null)
        #expect(try decode(#"{"type":"bool","value":true}"#) == .bool(true))
        #expect(try decode(#"{"type":"int","value":7}"#) == .int(7))
        #expect(try decode(#"{"type":"double","value":3.5}"#) == .double(3.5))
        #expect(try decode(#"{"type":"string","value":"hi"}"#) == .string("hi"))
        #expect(try decode(#"{"type":"array","value":[{"type":"int","value":1}]}"#) == .array([.int(1)]))
        #expect(try decode(#"{"type":"object","value":{"k":{"type":"int","value":1}}}"#) == .object(["k": .int(1)]))
        #expect(
            try decode(#"{"type":"date","value":1700000000}"#)
                == .date(Date(timeIntervalSince1970: 1_700_000_000))
        )
    }

    @Test("plain object without a known type keyword is not treated as legacy")
    func plainObjectWithTypeKeyStaysObject() throws {
        // A `type` key whose value is NOT one of the reserved keywords is plain data.
        let decoded = try JSONDecoder().decode(
            JinjaValue.self,
            from: Data(#"{"type":"widget","value":3}"#.utf8)
        )
        #expect(decoded == .object(["type": .string("widget"), "value": .int(3)]))
    }

    @Test("object with a reserved type keyword but extra fields stays plain")
    func taggedShapeRequiresExactKeys() throws {
        // Only an object whose keys are exactly {type} or {type,value} is a legacy
        // envelope. Extra fields mean it is schema-valid plain data — never legacy.
        let decoded = try JSONDecoder().decode(
            JinjaValue.self,
            from: Data(#"{"type":"int","value":5,"label":"x"}"#.utf8)
        )
        #expect(decoded == .object(["type": .string("int"), "value": .int(5), "label": .string("x")]))
    }

    @Test("legacy tagged value re-encodes as plain (migrate-on-load)")
    func legacyReencodesAsPlain() throws {
        let decoded = try JSONDecoder().decode(
            JinjaValue.self,
            from: Data(#"{"type":"object","value":{"n":{"type":"int","value":1}}}"#.utf8)
        )
        let reencoded = String(decoding: try JSONEncoder().encode(decoded), as: UTF8.self)
        #expect(reencoded == "{\"n\":1}")
    }

    @Test("Nested structure roundtrips")
    func nestedRoundtrip() throws {
        let value: JinjaValue = .object([
            "items": .array([
                .object(["id": .int(1), "name": .string("A")]),
                .object(["id": .int(2), "active": .bool(true)]),
            ]),
            "total": .int(2),
        ])
        try assertRoundtrip(value)
    }

    // MARK: - Type Accessors

    @Test("isNull")
    func isNull() {
        #expect(JinjaValue.null.isNull == true)
        #expect(JinjaValue.int(0).isNull == false)
    }

    @Test("boolValue")
    func boolValue() {
        #expect(JinjaValue.bool(true).boolValue == true)
        #expect(JinjaValue.string("x").boolValue == nil)
    }

    @Test("intValue")
    func intValue() {
        #expect(JinjaValue.int(7).intValue == 7)
        #expect(JinjaValue.string("7").intValue == nil)
    }

    @Test("doubleValue coerces int to double")
    func doubleValueCoercion() {
        #expect(JinjaValue.double(1.5).doubleValue == 1.5)
        #expect(JinjaValue.int(3).doubleValue == 3.0)
        #expect(JinjaValue.string("x").doubleValue == nil)
    }

    @Test("stringValue")
    func stringValue() {
        #expect(JinjaValue.string("hi").stringValue == "hi")
        #expect(JinjaValue.int(1).stringValue == nil)
    }

    @Test("arrayValue")
    func arrayValue() {
        let arr: [JinjaValue] = [.int(1)]
        #expect(JinjaValue.array(arr).arrayValue == arr)
        #expect(JinjaValue.null.arrayValue == nil)
    }

    @Test("objectValue")
    func objectValue() {
        let obj: [String: JinjaValue] = ["k": .int(1)]
        #expect(JinjaValue.object(obj).objectValue == obj)
        #expect(JinjaValue.null.objectValue == nil)
    }

    @Test("dateValue")
    func dateValue() {
        let d = Date()
        #expect(JinjaValue.date(d).dateValue == d)
        #expect(JinjaValue.null.dateValue == nil)
    }

    // MARK: - Subscript Access

    @Test("String subscript on object")
    func stringSubscript() {
        let v: JinjaValue = .object(["name": .string("Alice")])
        #expect(v["name"] == .string("Alice"))
        #expect(v["missing"] == nil)
    }

    @Test("String subscript on non-object returns nil")
    func stringSubscriptNonObject() {
        #expect(JinjaValue.int(1)["key"] == nil)
    }

    @Test("Int subscript on array")
    func intSubscript() {
        let v: JinjaValue = .array([.int(10), .int(20), .int(30)])
        #expect(v[0] == .int(10))
        #expect(v[2] == .int(30))
    }

    @Test("Int subscript out of bounds returns nil")
    func intSubscriptOutOfBounds() {
        let v: JinjaValue = .array([.int(1)])
        #expect(v[-1] == nil)
        #expect(v[1] == nil)
    }

    @Test("Int subscript on non-array returns nil")
    func intSubscriptNonArray() {
        #expect(JinjaValue.string("x")[0] == nil)
    }

    // MARK: - Path-based Access

    @Test("get(path:) navigates nested objects")
    func pathNavigatesObjects() {
        let v: JinjaValue = .object([
            "user": .object(["name": .string("Alice")])
        ])
        #expect(v.get(path: "user.name") == .string("Alice"))
    }

    @Test("get(path:) navigates arrays by index")
    func pathNavigatesArrays() {
        let v: JinjaValue = .object([
            "items": .array([.string("a"), .string("b")])
        ])
        #expect(v.get(path: "items.1") == .string("b"))
    }

    @Test("get(path:) returns nil for missing path")
    func pathMissingReturnsNil() {
        let v: JinjaValue = .object(["x": .int(1)])
        #expect(v.get(path: "x.y.z") == nil)
    }

    @Test("get(path:) with empty path returns self")
    func pathEmptyReturnsSelf() {
        let v: JinjaValue = .int(42)
        #expect(v.get(path: "") == .int(42))
    }

    @Test("get(path:) deep nested path")
    func pathDeepNested() {
        let v: JinjaValue = .object([
            "a": .object([
                "b": .array([
                    .object(["c": .string("found")])
                ])
            ])
        ])
        #expect(v.get(path: "a.b.0.c") == .string("found"))
    }

    // MARK: - Literal Conformances

    @Test("nil literal")
    func nilLiteral() {
        let v: JinjaValue = nil
        #expect(v == .null)
    }

    @Test("bool literal")
    func boolLiteral() {
        let v: JinjaValue = true
        #expect(v == .bool(true))
    }

    @Test("int literal")
    func intLiteral() {
        let v: JinjaValue = 42
        #expect(v == .int(42))
    }

    @Test("float literal")
    func floatLiteral() {
        let v: JinjaValue = 3.14
        #expect(v == .double(3.14))
    }

    @Test("string literal")
    func stringLiteral() {
        let v: JinjaValue = "hello"
        #expect(v == .string("hello"))
    }

    @Test("array literal")
    func arrayLiteral() {
        let v: JinjaValue = [1, "two"]
        #expect(v == .array([.int(1), .string("two")]))
    }

    @Test("dictionary literal")
    func dictLiteral() {
        let v: JinjaValue = ["k": 1]
        #expect(v == .object(["k": .int(1)]))
    }

    // MARK: - Convenience Inits

    @Test("Convenience init from Bool")
    func convenienceInitBool() {
        #expect(JinjaValue(true) == .bool(true))
    }

    @Test("Convenience init from Int")
    func convenienceInitInt() {
        #expect(JinjaValue(42) == .int(42))
    }

    @Test("Convenience init from Double")
    func convenienceInitDouble() {
        #expect(JinjaValue(3.14) == .double(3.14))
    }

    @Test("Convenience init from String")
    func convenienceInitString() {
        #expect(JinjaValue("hi") == .string("hi"))
    }

    @Test("Convenience init from Array")
    func convenienceInitArray() {
        #expect(JinjaValue([.int(1)]) == .array([.int(1)]))
    }

    @Test("Convenience init from Dictionary")
    func convenienceInitDict() {
        #expect(JinjaValue(["k": .int(1)]) == .object(["k": .int(1)]))
    }

    @Test("Convenience init from Date")
    func convenienceInitDate() {
        let d = Date()
        #expect(JinjaValue(d) == .date(d))
    }

    // MARK: - Helpers

    private func assertRoundtrip(_ value: JinjaValue) throws {
        let data = try JSONEncoder().encode(value)
        let decoded = try JSONDecoder().decode(JinjaValue.self, from: data)
        #expect(decoded == value)
    }
}
