//
//  ParserTests.swift
//  CococoJinjaTests
//
//  Copyright Triple C Labs GmbH
//

import Foundation
import Testing

@testable import CococoJinja

@Suite("Expression parser")
struct ParserTests {

    private func parse(_ source: String) throws -> Expr {
        try Parser.parse(source: source)
    }

    private func ref(_ segments: PathSegment...) -> Expr { .reference(segments) }

    // MARK: - Literals

    @Test("Scalar literals")
    func scalarLiterals() throws {
        #expect(try parse("42") == .literal(.int(42)))
        #expect(try parse("3.14") == .literal(.double(3.14)))
        #expect(try parse("'hi'") == .literal(.string("hi")))
        #expect(try parse("true") == .literal(.bool(true)))
        #expect(try parse("false") == .literal(.bool(false)))
        #expect(try parse("null") == .literal(.null))
        #expect(try parse("none") == .literal(.null))
    }

    @Test("Negative numeric literals are constant-folded to bare literals")
    func negativeLiterals() throws {
        #expect(try parse("-5") == .literal(.int(-5)))
        #expect(try parse("-2.5") == .literal(.double(-2.5)))
        // Negation of a non-literal stays a unary node.
        #expect(try parse("-x") == .unary(.negate, ref(.key("x"))))
    }

    @Test("Unary plus is a no-op")
    func unaryPlus() throws {
        #expect(try parse("+5") == .literal(.int(5)))
    }

    // MARK: - References

    @Test("Member access builds a reference path")
    func memberAccess() throws {
        #expect(try parse("input") == ref(.key("input")))
        #expect(try parse("input.age") == ref(.key("input"), .key("age")))
        #expect(try parse("nodes.n1.output.value")
            == ref(.key("nodes"), .key("n1"), .key("output"), .key("value")))
    }

    @Test("Index and string-key subscripts")
    func subscripts() throws {
        #expect(try parse("items[0]") == ref(.key("items"), .index(0)))
        #expect(try parse("a[\"b-c\"]") == ref(.key("a"), .key("b-c")))
        #expect(try parse("a.b[2].c")
            == ref(.key("a"), .key("b"), .index(2), .key("c")))
    }

    @Test("Dynamic subscript holds an expression")
    func dynamicSubscript() throws {
        #expect(try parse("items[input.idx]")
            == ref(.key("items"), .dynamic(ref(.key("input"), .key("idx")))))
    }

    // MARK: - Operator precedence

    @Test("Arithmetic precedence: * binds tighter than +")
    func arithmeticPrecedence() throws {
        #expect(try parse("1 + 2 * 3")
            == .binary(.add, .literal(.int(1)), .binary(.multiply, .literal(.int(2)), .literal(.int(3)))))
    }

    @Test("Additive is left-associative")
    func additiveAssociativity() throws {
        #expect(try parse("1 - 2 - 3")
            == .binary(.subtract, .binary(.subtract, .literal(.int(1)), .literal(.int(2))), .literal(.int(3))))
    }

    @Test("Comparison binds looser than arithmetic")
    func comparisonVsArithmetic() throws {
        #expect(try parse("a + 1 > b")
            == .binary(.gt, .binary(.add, ref(.key("a")), .literal(.int(1))), ref(.key("b"))))
    }

    @Test("not binds looser than comparison")
    func notVsComparison() throws {
        #expect(try parse("not a == b")
            == .unary(.not, .binary(.eq, ref(.key("a")), ref(.key("b")))))
    }

    @Test("and binds tighter than or")
    func andVsOr() throws {
        // a or b and c  ->  a or (b and c)
        #expect(try parse("a or b and c")
            == .logical(.or, [ref(.key("a")), .logical(.and, [ref(.key("b")), ref(.key("c"))])]))
    }

    @Test("Logical operators are n-ary and flat")
    func logicalNary() throws {
        #expect(try parse("a and b and c")
            == .logical(.and, [ref(.key("a")), ref(.key("b")), ref(.key("c"))]))
        #expect(try parse("a or b or c or d")
            == .logical(.or, [ref(.key("a")), ref(.key("b")), ref(.key("c")), ref(.key("d"))]))
    }

    @Test("Concat ~ binds looser than arithmetic, tighter than comparison")
    func concatPrecedence() throws {
        #expect(try parse("a ~ b == c")
            == .binary(.eq, .binary(.concat, ref(.key("a")), ref(.key("b"))), ref(.key("c"))))
    }

    @Test("Grouping overrides precedence")
    func grouping() throws {
        #expect(try parse("(1 + 2) * 3")
            == .binary(.multiply, .binary(.add, .literal(.int(1)), .literal(.int(2))), .literal(.int(3))))
    }

    // MARK: - Membership

    @Test("in and not in")
    func membership() throws {
        #expect(try parse("x in items") == .binary(.contains, ref(.key("x")), ref(.key("items"))))
        #expect(try parse("x not in items") == .binary(.notContains, ref(.key("x")), ref(.key("items"))))
    }

    // MARK: - Ternary

    @Test("Ternary parses with Jinja value-first order")
    func ternary() throws {
        // "yes" if cond else "no"
        #expect(try parse("'yes' if cond else 'no'")
            == .conditional(condition: ref(.key("cond")),
                            then: .literal(.string("yes")),
                            otherwise: .literal(.string("no"))))
    }

    @Test("Ternary is right-associative (chains)")
    func ternaryChaining() throws {
        // a if c1 else b if c2 else d  ->  a if c1 else (b if c2 else d)
        let parsed = try parse("a if c1 else b if c2 else d")
        #expect(parsed == .conditional(
            condition: ref(.key("c1")),
            then: ref(.key("a")),
            otherwise: .conditional(condition: ref(.key("c2")), then: ref(.key("b")), otherwise: ref(.key("d")))))
    }

    // MARK: - Filters

    @Test("Filter without arguments")
    func filterNoArgs() throws {
        #expect(try parse("items | length")
            == .filter(name: "length", input: ref(.key("items")), arguments: []))
    }

    @Test("Filter with arguments")
    func filterWithArgs() throws {
        #expect(try parse("value | default('n/a')")
            == .filter(name: "default", input: ref(.key("value")), arguments: [.literal(.string("n/a"))]))
    }

    @Test("Filter chains are left-associative")
    func filterChain() throws {
        // a | f | g  ->  g(f(a))
        #expect(try parse("a | f | g")
            == .filter(name: "g",
                       input: .filter(name: "f", input: ref(.key("a")), arguments: []),
                       arguments: []))
    }

    @Test("Filter binds tighter than arithmetic")
    func filterVsArithmetic() throws {
        // a | f + b  ->  (a | f) + b
        #expect(try parse("a | f + b")
            == .binary(.add, .filter(name: "f", input: ref(.key("a")), arguments: []), ref(.key("b"))))
    }

    // MARK: - Collection literals

    @Test("Array literal")
    func arrayLiteral() throws {
        #expect(try parse("[1, 2, 3]")
            == .arrayLiteral([.literal(.int(1)), .literal(.int(2)), .literal(.int(3))]))
        #expect(try parse("[]") == .arrayLiteral([]))
    }

    @Test("Array literal with trailing comma")
    func arrayTrailingComma() throws {
        #expect(try parse("[1, 2,]") == .arrayLiteral([.literal(.int(1)), .literal(.int(2))]))
    }

    @Test("Object literal with string and identifier keys")
    func objectLiteral() throws {
        #expect(try parse("{ \"a\": 1, b: 2 }")
            == .objectLiteral([
                ObjectEntry(key: "a", value: .literal(.int(1))),
                ObjectEntry(key: "b", value: .literal(.int(2))),
            ]))
        #expect(try parse("{}") == .objectLiteral([]))
    }

    @Test("Object literal with expression values and trailing comma")
    func objectExpressionValues() throws {
        #expect(try parse("{ total: a + b, }")
            == .objectLiteral([
                ObjectEntry(key: "total", value: .binary(.add, ref(.key("a")), ref(.key("b")))),
            ]))
    }

    // MARK: - Error cases

    @Test("Trailing tokens after a complete expression throw")
    func trailingTokens() {
        #expect(throws: ExpressionError.self) { _ = try parse("1 2") }
        #expect(throws: ExpressionError.self) { _ = try parse("a b") }
    }

    @Test("Unclosed grouping/brackets throw")
    func unclosed() {
        #expect(throws: ExpressionError.self) { _ = try parse("(1 + 2") }
        #expect(throws: ExpressionError.self) { _ = try parse("[1, 2") }
        #expect(throws: ExpressionError.self) { _ = try parse("{ a: 1") }
    }

    @Test("Missing filter name throws")
    func missingFilterName() {
        #expect(throws: ExpressionError.self) { _ = try parse("a | 5") }
        #expect(throws: ExpressionError.self) { _ = try parse("a |") }
    }

    @Test("Bad member access throws")
    func badMemberAccess() {
        #expect(throws: ExpressionError.self) { _ = try parse("a.") }
        #expect(throws: ExpressionError.self) { _ = try parse("a.1") }
    }

    @Test("Dangling 'not' without 'in' at membership position throws")
    func danglingNot() {
        // `a not b` — `not` here is only valid as `not in`.
        #expect(throws: ExpressionError.self) { _ = try parse("a not b") }
    }

    @Test("Empty input throws")
    func emptyInput() {
        #expect(throws: ExpressionError.self) { _ = try parse("") }
        #expect(throws: ExpressionError.self) { _ = try parse("   ") }
    }
}
