//
//  ExpressionTemplateTests.swift
//  CococoJinjaTests
//
//  Copyright Triple C Labs GmbH
//

import Foundation
import Testing

@testable import CococoJinja

@Suite("Expression template / smart evaluator")
struct ExpressionTemplateTests {

    private static let context: JinjaValue = .object([
        "input": .object([
            "age": .int(25),
            "name": .string("Ada"),
            "items": .array([.int(1), .int(2)]),
            "createdAt": .date(Date(timeIntervalSince1970: 0)),
            "maybe": .null,
        ]),
    ])

    private func evaluate(_ source: String) throws -> JinjaValue {
        try ExpressionTemplate.evaluate(source, context: Self.context)
    }

    private func render(_ source: String) throws -> String {
        try ExpressionTemplate.render(source, context: Self.context)
    }

    // MARK: - Single expression → typed

    @Test("A single expression span returns a typed value")
    func singleExpressionTyped() throws {
        #expect(try evaluate("{{ input.age >= 18 }}") == .bool(true))
        #expect(try evaluate("{{ input.age }}") == .int(25))
        #expect(try evaluate("{{ input.items }}") == .array([.int(1), .int(2)]))
        #expect(try evaluate("{{ input.age + 5 }}") == .int(30))
    }

    @Test("Surrounding whitespace still counts as a single expression")
    func surroundingWhitespace() throws {
        #expect(try evaluate("  {{ input.age }}  ") == .int(25))
        #expect(try evaluate("\n{{ input.age }}\n") == .int(25))
    }

    // MARK: - Plaintext & mixed → string

    @Test("Pure plaintext returns the string verbatim")
    func plaintext() throws {
        #expect(try evaluate("Just regular text") == .string("Just regular text"))
        #expect(try evaluate("no braces here") == .string("no braces here"))
    }

    @Test("Mixed text and expression renders to a string")
    func mixed() throws {
        #expect(try evaluate("User is {{ input.name }}") == .string("User is Ada"))
        #expect(try evaluate("{{ input.name }} is {{ input.age }}") == .string("Ada is 25"))
    }

    @Test("Multiple expressions force string rendering even with no literal text")
    func multipleExpressions() throws {
        #expect(try evaluate("{{ input.name }}{{ input.age }}") == .string("Ada25"))
    }

    // MARK: - Interpolation rendering of types

    @Test("Interpolation renders types per the string projection")
    func interpolationRendering() throws {
        #expect(try render("{{ input.maybe }}") == "")                       // null → ""
        #expect(try render("{{ input.age }}") == "25")
        #expect(try render("{{ input.items }}") == "[1,2]")                   // array → JSON
        #expect(try render("{{ input.createdAt }}") == "1970-01-01T00:00:00Z") // date → ISO8601
        #expect(try render("at {{ input.createdAt }}!") == "at 1970-01-01T00:00:00Z!")
    }

    @Test("render() always returns a string, even for a single expression")
    func renderAlwaysString() throws {
        #expect(try render("{{ input.age >= 18 }}") == "true")
        #expect(try render("{{ input.age }}") == "25")
    }

    // MARK: - Single-brace passthrough

    @Test("Single braces are literal text, not a span")
    func singleBraces() throws {
        #expect(try evaluate("a { b } c") == .string("a { b } c"))
        #expect(try evaluate("{ not a span }") == .string("{ not a span }"))
    }

    // MARK: - singleExpression(in:)

    @Test("singleExpression recovers the AST for a single span")
    func singleExpressionExtraction() throws {
        #expect(try ExpressionTemplate.singleExpression(in: "{{ input.age >= 18 }}")
            == .binary(.gte, .reference([.key("input"), .key("age")]), .literal(.int(18))))
        #expect(try ExpressionTemplate.singleExpression(in: "  {{ x }}  ") == .reference([.key("x")]))
    }

    @Test("singleExpression returns nil for plaintext, mixed, and multi-span")
    func singleExpressionNil() throws {
        #expect(try ExpressionTemplate.singleExpression(in: "plain") == nil)
        #expect(try ExpressionTemplate.singleExpression(in: "x is {{ y }}") == nil)
        #expect(try ExpressionTemplate.singleExpression(in: "{{ a }}{{ b }}") == nil)
    }

    // MARK: - Errors

    @Test("Unterminated span throws")
    func unterminated() {
        #expect(throws: ExpressionError.self) { _ = try evaluate("{{ input.age ") }
    }

    @Test("Malformed expression in a span throws with a rebased offset")
    func malformedSpanOffset() {
        do {
            _ = try evaluate("ok {{ 1 2 }}")
            Issue.record("expected throw")
        } catch let error as ExpressionError {
            #expect(error.phase == .parse)
            // The offending '2' is at source offset 8 (after "ok {{ 1 ").
            #expect(error.offset == 8)
        } catch {
            Issue.record("wrong error: \(error)")
        }
    }
}
