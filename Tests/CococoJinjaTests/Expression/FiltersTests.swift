//
//  FiltersTests.swift
//  CococoJinjaTests
//
//  Copyright Triple C Labs GmbH
//

import Foundation
import Testing

@testable import CococoJinja

@Suite("Expression standard filters")
struct FiltersTests {

    private func eval(_ source: String) throws -> JinjaValue {
        let ast = try Parser.parse(source: source)
        return try Evaluator.evaluate(ast, context: .object([:]), filters: .standard)
    }

    // MARK: - default

    @Test("default substitutes only for null")
    func defaultFilter() throws {
        #expect(try eval("null | default('x')") == .string("x"))
        #expect(try eval("5 | default(0)") == .int(5))
        #expect(try eval("'' | default('x')") == .string("")) // empty string is not null
        #expect(try eval("0 | default(9)") == .int(0))
    }

    @Test("default requires exactly one argument")
    func defaultArity() {
        #expect(throws: ExpressionError.self) { _ = try eval("null | default") }
        #expect(throws: ExpressionError.self) { _ = try eval("null | default(1, 2)") }
    }

    // MARK: - length

    @Test("length of array, object, string")
    func length() throws {
        #expect(try eval("[1, 2, 3] | length") == .int(3))
        #expect(try eval("{a: 1, b: 2} | length") == .int(2))
        #expect(try eval("'hello' | length") == .int(5))
    }

    @Test("length of a scalar throws")
    func lengthError() {
        #expect(throws: ExpressionError.self) { _ = try eval("5 | length") }
    }

    // MARK: - min / max

    @Test("min and max over arrays")
    func minMax() throws {
        #expect(try eval("[3, 1, 2] | min") == .int(1))
        #expect(try eval("[3, 1, 2] | max") == .int(3))
        #expect(try eval("['b', 'a', 'c'] | max") == .string("c"))
        #expect(try eval("[1, 2.5, 2] | max") == .double(2.5))
    }

    @Test("min/max on empty or non-array throws")
    func minMaxError() {
        #expect(throws: ExpressionError.self) { _ = try eval("[] | min") }
        #expect(throws: ExpressionError.self) { _ = try eval("5 | max") }
        #expect(throws: ExpressionError.self) { _ = try eval("[1, 'a'] | max") } // not mutually orderable
    }

    // MARK: - string filters

    @Test("lower, upper, trim")
    func stringFilters() throws {
        #expect(try eval("'HeLLo' | lower") == .string("hello"))
        #expect(try eval("'HeLLo' | upper") == .string("HELLO"))
        #expect(try eval("'  spaced  ' | trim") == .string("spaced"))
    }

    @Test("string filters reject non-strings")
    func stringFilterErrors() {
        #expect(throws: ExpressionError.self) { _ = try eval("5 | lower") }
        #expect(throws: ExpressionError.self) { _ = try eval("5 | trim") }
    }

    // MARK: - join

    @Test("join with and without a separator")
    func join() throws {
        #expect(try eval("['a', 'b', 'c'] | join(', ')") == .string("a, b, c"))
        #expect(try eval("[1, 2, 3] | join") == .string("123")) // coerces + default sep
    }

    @Test("join on a non-array throws")
    func joinError() {
        #expect(throws: ExpressionError.self) { _ = try eval("'abc' | join(',')") }
    }

    // MARK: - abs / round

    @Test("abs preserves numeric type")
    func abs() throws {
        // Filter binds tighter than unary minus (Jinja), so the negative must be
        // grouped: `-5 | abs` parses as `-(5 | abs)`.
        #expect(try eval("(-5) | abs") == .int(5))
        #expect(try eval("(-2.5) | abs") == .double(2.5))
        #expect(try eval("-5 | abs") == .int(-5)) // == -(5 | abs)
    }

    @Test("round with optional precision")
    func round() throws {
        #expect(try eval("2.4 | round") == .double(2.0))
        #expect(try eval("2.5 | round") == .double(3.0))
        #expect(try eval("3.14159 | round(2)") == .double(3.14))
    }

    @Test("abs/round reject non-numbers")
    func numericFilterErrors() {
        #expect(throws: ExpressionError.self) { _ = try eval("'x' | abs") }
        #expect(throws: ExpressionError.self) { _ = try eval("'x' | round") }
    }

    // MARK: - merge

    @Test("merge overlays the argument object")
    func merge() throws {
        #expect(try eval("{a: 1, b: 2} | merge({b: 3, c: 4})")
            == .object(["a": .int(1), "b": .int(3), "c": .int(4)]))
    }

    @Test("merge requires two objects")
    func mergeError() {
        #expect(throws: ExpressionError.self) { _ = try eval("5 | merge({a: 1})") }
        #expect(throws: ExpressionError.self) { _ = try eval("{a: 1} | merge(5)") }
    }

    // MARK: - pick / omit

    @Test("pick keeps only listed, present keys")
    func pick() throws {
        #expect(try eval("{a: 1, b: 2, c: 3} | pick('a', 'c')")
            == .object(["a": .int(1), "c": .int(3)]))
        #expect(try eval("{a: 1} | pick('a', 'missing')") == .object(["a": .int(1)]))
    }

    @Test("omit drops listed keys")
    func omit() throws {
        #expect(try eval("{a: 1, b: 2, c: 3} | omit('b')")
            == .object(["a": .int(1), "c": .int(3)]))
    }

    @Test("pick/omit require an object input and string keys")
    func pickOmitErrors() {
        #expect(throws: ExpressionError.self) { _ = try eval("5 | pick('a')") }
        #expect(throws: ExpressionError.self) { _ = try eval("{a: 1} | omit(5)") }
    }

    // MARK: - concat

    @Test("concat of arrays and of strings")
    func concat() throws {
        #expect(try eval("[1, 2] | concat([3, 4])")
            == .array([.int(1), .int(2), .int(3), .int(4)]))
        #expect(try eval("'ab' | concat('cd')") == .string("abcd"))
    }

    @Test("concat rejects mixed/other types")
    func concatError() {
        #expect(throws: ExpressionError.self) { _ = try eval("[1] | concat('x')") }
        #expect(throws: ExpressionError.self) { _ = try eval("5 | concat(6)") }
    }

    // MARK: - chaining

    @Test("filters chain")
    func chaining() throws {
        #expect(try eval("'  HeLLo  ' | trim | lower") == .string("hello"))
        #expect(try eval("[3, 1, 2] | max | abs") == .int(3))
    }

    // MARK: - registry surface

    @Test("standard registry exposes exactly the documented allowlist")
    func registrySurface() {
        #expect(FilterRegistry.standard.names == [
            "default", "length", "min", "max", "lower", "upper", "trim", "join",
            "abs", "round", "merge", "pick", "omit", "concat",
        ])
    }
}
