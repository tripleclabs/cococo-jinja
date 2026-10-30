//
//  JSONDecodingFixtureTests.swift
//  CococoJinjaTests
//
//  Copyright Triple C Labs GmbH
//
//  Runs `fixtures/value/json-decoding.json` — JSON decoding parity shared with
//  the @cococo/jinja TS peer. `plain` cases go through `fromJSONString` and
//  `fromJSONData`; `legacy` cases through a `JSONDecoder` with
//  `JinjaValue.decodeLegacyTaggedEnvelopes` set (WorkflowValueStorage's path
//  for unframed historical data). Comparison is strict: `.int` ≠ `.double`.
//

import Foundation
import Testing

import CococoJinja

@Suite("Fixture parity — json-decoding.json")
struct JSONDecodingFixtureTests {

    private struct Fixture: Decodable {
        let name: String
        let cases: [Case]
        struct Case: Decodable {
            let id: String
            let mode: String
            let json: String
            let expect: Tagged?
            let error: Bool?

            private enum CodingKeys: String, CodingKey { case id, mode, json, expect, error }

            init(from decoder: Decoder) throws {
                let container = try decoder.container(keyedBy: CodingKeys.self)
                id = try container.decode(String.self, forKey: .id)
                mode = try container.decode(String.self, forKey: .mode)
                json = try container.decode(String.self, forKey: .json)
                error = try container.decodeIfPresent(Bool.self, forKey: .error)
                // `"expect": null` means `.null`; an absent key means no expectation.
                expect = container.contains(.expect) ? try container.decode(Tagged.self, forKey: .expect) : nil
            }
        }
    }

    /// The fixture's tagged expectation form, which keeps int and double distinct.
    private struct Tagged: Decodable {
        let value: JinjaValue

        private struct Key: CodingKey {
            let stringValue: String
            init(stringValue: String) { self.stringValue = stringValue }
            var intValue: Int? { nil }
            init?(intValue: Int) { nil }
        }

        init(from decoder: Decoder) throws {
            if try decoder.singleValueContainer().decodeNil() {
                value = .null
                return
            }
            let container = try decoder.container(keyedBy: Key.self)
            guard container.allKeys.count == 1, let key = container.allKeys.first else {
                throw DecodingError.dataCorrupted(.init(codingPath: decoder.codingPath, debugDescription: "tagged value needs one key"))
            }
            switch key.stringValue {
            case "int": value = .int(try container.decode(Int.self, forKey: key))
            case "double": value = .double(try container.decode(Double.self, forKey: key))
            case "bool": value = .bool(try container.decode(Bool.self, forKey: key))
            case "string": value = .string(try container.decode(String.self, forKey: key))
            case "array": value = .array(try container.decode([Tagged].self, forKey: key).map(\.value))
            case "object": value = .object(try container.decode([String: Tagged].self, forKey: key).mapValues(\.value))
            default:
                throw DecodingError.dataCorrupted(.init(codingPath: decoder.codingPath, debugDescription: "unknown tag \(key.stringValue)"))
            }
        }
    }

    private static func loadFixture() throws -> Fixture {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("fixtures/value/json-decoding.json")
        return try JSONDecoder().decode(Fixture.self, from: Data(contentsOf: url))
    }

    private static func decoders(for mode: String) -> [(String, (String) throws -> JinjaValue)] {
        switch mode {
        case "plain":
            return [
                ("fromJSONString", { try JinjaValue.fromJSONString($0) }),
                ("fromJSONData", { try JinjaValue.fromJSONData(Data($0.utf8)) }),
            ]
        case "legacy":
            return [("legacy JSONDecoder", { text in
                let decoder = JSONDecoder()
                decoder.userInfo[JinjaValue.decodeLegacyTaggedEnvelopes] = true
                return try decoder.decode(JinjaValue.self, from: Data(text.utf8))
            })]
        default:
            return []
        }
    }

    @Test("Every JSON decoding case matches")
    func parity() throws {
        let fixture = try Self.loadFixture()
        #expect(fixture.name == "json-decoding")
        var failures: [String] = []
        for c in fixture.cases {
            let decoders = Self.decoders(for: c.mode)
            if decoders.isEmpty { failures.append("[\(c.id)] unknown mode \(c.mode)") }
            for (label, decode) in decoders {
                do {
                    let actual = try decode(c.json)
                    if c.error == true {
                        failures.append("[\(c.id) \(label)] expected an error but got \(actual)")
                    } else if let expected = c.expect?.value, actual != expected {
                        failures.append("[\(c.id) \(label)] expected \(expected) but got \(actual)")
                    }
                } catch {
                    if c.error != true { failures.append("[\(c.id) \(label)] threw \(error)") }
                }
            }
        }
        if !failures.isEmpty {
            Issue.record(Comment(rawValue: "JSON decoding failures:\n" + failures.joined(separator: "\n")))
        }
        #expect(failures.isEmpty)
    }
}
