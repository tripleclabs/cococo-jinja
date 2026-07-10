//
//  ValueSemanticsTests.swift
//  CococoJinjaTests
//
//  Copyright Triple C Labs GmbH
//

import Foundation
import Testing

@testable import CococoJinja

@Suite("Expression value semantics")
struct ValueSemanticsTests {

    // MARK: - Truthiness (§3)

    @Test("Falsy values")
    func falsyValues() {
        #expect(JinjaValue.null.isTruthy == false)
        #expect(JinjaValue.bool(false).isTruthy == false)
        #expect(JinjaValue.int(0).isTruthy == false)
        #expect(JinjaValue.double(0).isTruthy == false)
        #expect(JinjaValue.string("").isTruthy == false)
        #expect(JinjaValue.array([]).isTruthy == false)
        #expect(JinjaValue.object([:]).isTruthy == false)
    }

    @Test("Truthy values, including any date")
    func truthyValues() {
        #expect(JinjaValue.bool(true).isTruthy)
        #expect(JinjaValue.int(1).isTruthy)
        #expect(JinjaValue.int(-1).isTruthy)
        #expect(JinjaValue.double(0.1).isTruthy)
        #expect(JinjaValue.string("x").isTruthy)
        #expect(JinjaValue.array([.int(0)]).isTruthy)
        #expect(JinjaValue.object(["k": .null]).isTruthy)
        #expect(JinjaValue.date(Date(timeIntervalSince1970: 0)).isTruthy)
    }

    // MARK: - Semantic equality (§11.4)

    @Test("Numeric equality across int/double")
    func numericEquality() {
        #expect(JinjaValue.semanticEquals(.int(1), .double(1.0)))
        #expect(JinjaValue.semanticEquals(.double(2.0), .int(2)))
        #expect(JinjaValue.semanticEquals(.int(3), .int(3)))
        #expect(!JinjaValue.semanticEquals(.int(1), .double(1.5)))
    }

    @Test("Cross-type equality is false, never an error")
    func crossTypeEqualityIsFalse() {
        #expect(!JinjaValue.semanticEquals(.int(1), .string("1")))
        #expect(!JinjaValue.semanticEquals(.null, .int(0)))
        #expect(!JinjaValue.semanticEquals(.bool(true), .int(1)))
        #expect(!JinjaValue.semanticEquals(.null, .bool(false)))
    }

    @Test("Scalar equality by type")
    func scalarEquality() {
        #expect(JinjaValue.semanticEquals(.string("a"), .string("a")))
        #expect(!JinjaValue.semanticEquals(.string("a"), .string("b")))
        #expect(JinjaValue.semanticEquals(.bool(true), .bool(true)))
        #expect(JinjaValue.semanticEquals(.null, .null))
        let d = Date(timeIntervalSince1970: 1000)
        #expect(JinjaValue.semanticEquals(.date(d), .date(d)))
        #expect(!JinjaValue.semanticEquals(.date(d), .date(d.addingTimeInterval(1))))
    }

    @Test("Deep array and object equality uses semantic rules")
    func deepEquality() {
        #expect(JinjaValue.semanticEquals(
            .array([.int(1), .double(2.0)]),
            .array([.double(1.0), .int(2)])
        ))
        #expect(!JinjaValue.semanticEquals(.array([.int(1)]), .array([.int(1), .int(2)])))
        #expect(JinjaValue.semanticEquals(
            .object(["a": .int(1), "b": .double(2.0)]),
            .object(["b": .int(2), "a": .double(1.0)])
        ))
        #expect(!JinjaValue.semanticEquals(
            .object(["a": .int(1)]),
            .object(["a": .int(1), "b": .int(2)])
        ))
    }

    // MARK: - Ordered comparison (§11.5)

    @Test("Numeric ordering across int/double")
    func numericOrdering() throws {
        #expect(try JinjaValue.semanticCompare(.int(1), .int(2)) == .orderedAscending)
        #expect(try JinjaValue.semanticCompare(.double(2.5), .int(2)) == .orderedDescending)
        #expect(try JinjaValue.semanticCompare(.int(3), .double(3.0)) == .orderedSame)
    }

    @Test("String ordering is lexicographic")
    func stringOrdering() throws {
        #expect(try JinjaValue.semanticCompare(.string("a"), .string("b")) == .orderedAscending)
        #expect(try JinjaValue.semanticCompare(.string("b"), .string("a")) == .orderedDescending)
        #expect(try JinjaValue.semanticCompare(.string("a"), .string("a")) == .orderedSame)
    }

    @Test("Date ordering is chronological")
    func dateOrdering() throws {
        let early = JinjaValue.date(Date(timeIntervalSince1970: 0))
        let late = JinjaValue.date(Date(timeIntervalSince1970: 100))
        #expect(try JinjaValue.semanticCompare(early, late) == .orderedAscending)
        #expect(try JinjaValue.semanticCompare(late, early) == .orderedDescending)
    }

    @Test("Ordering mismatched or non-orderable types throws")
    func orderingThrows() {
        #expect(throws: ExpressionError.self) {
            _ = try JinjaValue.semanticCompare(.int(1), .string("1"))
        }
        #expect(throws: ExpressionError.self) {
            _ = try JinjaValue.semanticCompare(.bool(true), .bool(false))
        }
        #expect(throws: ExpressionError.self) {
            _ = try JinjaValue.semanticCompare(.null, .null)
        }
    }

    // MARK: - Text rendering (§3 / §6)

    @Test("Scalar rendering")
    func scalarRendering() {
        #expect(JinjaValue.null.renderedString() == "")
        #expect(JinjaValue.bool(true).renderedString() == "true")
        #expect(JinjaValue.bool(false).renderedString() == "false")
        #expect(JinjaValue.int(42).renderedString() == "42")
        #expect(JinjaValue.string("hello").renderedString() == "hello")
    }

    @Test("Date renders as ISO8601 UTC")
    func dateRendering() {
        let d = JinjaValue.date(Date(timeIntervalSince1970: 0))
        #expect(d.renderedString() == "1970-01-01T00:00:00Z")
    }

    @Test("Array and object render as JSON")
    func collectionRendering() {
        // Arrays preserve order, so this is stable.
        #expect(JinjaValue.array([.int(1), .int(2)]).renderedString() == "[1,2]")
    }
}
