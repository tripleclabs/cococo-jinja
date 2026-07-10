//
//  PrinterRoundTripTests.swift
//  CococoJinjaTests
//
//  Copyright Triple C Labs GmbH
//
//  Enforces the §5 round-trip invariants for the canonical printer.
//

import Foundation
import Testing

@testable import CococoJinja

@Suite("Expression printer & round-trip")
struct PrinterRoundTripTests {

    /// A broad corpus exercising every node kind and precedence interaction.
    private static let corpus: [String] = [
        // literals
        "42", "-5", "3.14", "-2.5", "'hello'", "true", "false", "null",
        // references
        "input", "input.age", "nodes.n1.output.value", "items[0]", "a.b[2].c",
        "items[input.idx]", "a[\"b-c\"]",
        // arithmetic & precedence
        "1 + 2 * 3", "1 - 2 - 3", "(1 + 2) * 3", "a / b // c % d",
        "a + 1 > b", "a ~ b == c",
        // comparison & logic
        "input.age >= 18", "x == null", "a != b",
        "a and b and c", "a or b or c", "a or b and c", "(a or b) and c",
        "not a", "not a == b", "not (a and b)",
        // membership
        "x in items", "x not in items",
        // ternary
        "'yes' if cond else 'no'", "a if c1 else b if c2 else d",
        // filters
        "items | length", "value | default('n/a')", "a | f | g",
        "(a + b) | f", "items | join(', ')",
        // collections
        "[1, 2, 3]", "[]", "{a: 1, b: 2}", "{}", "{total: a + b}",
        // mixed/realistic
        "input.age >= 18 and user.role == 'admin'",
        "(items | length) > 0 and not done",
        "status if status != null else 'pending'",
    ]

    @Test("parse(print(ast)) ≡ ast for the whole corpus", arguments: corpus)
    func parsePrintIsIdentityOnAST(_ source: String) throws {
        let ast1 = try Parser.parse(source: source)
        let printed = Printer.print(ast1)
        let ast2 = try Parser.parse(source: printed)
        #expect(ast1 == ast2, "AST changed through print/parse for: \(source) → \(printed)")
    }

    @Test("print(parse(text)) is idempotent for the whole corpus", arguments: corpus)
    func printIsIdempotent(_ source: String) throws {
        let once = Printer.print(try Parser.parse(source: source))
        let twice = Printer.print(try Parser.parse(source: once))
        #expect(once == twice, "printing not idempotent for: \(source) → \(once) → \(twice)")
    }

    // MARK: - Canonical normalization

    @Test("Whitespace is normalized canonically")
    func whitespaceNormalized() throws {
        #expect(Printer.print(try Parser.parse(source: "1+2*3")) == "1 + 2 * 3")
        #expect(Printer.print(try Parser.parse(source: "a   and    b")) == "a and b")
        #expect(Printer.print(try Parser.parse(source: "input.age>=18")) == "input.age >= 18")
    }

    @Test("Redundant parentheses are dropped")
    func redundantParensDropped() throws {
        #expect(Printer.print(try Parser.parse(source: "((1 + 2))")) == "1 + 2")
        #expect(Printer.print(try Parser.parse(source: "(a)")) == "a")
    }

    @Test("Necessary parentheses are kept")
    func necessaryParensKept() throws {
        #expect(Printer.print(try Parser.parse(source: "(1 + 2) * 3")) == "(1 + 2) * 3")
        #expect(Printer.print(try Parser.parse(source: "(a or b) and c")) == "(a or b) and c")
        #expect(Printer.print(try Parser.parse(source: "1 - (2 - 3)")) == "1 - (2 - 3)")
    }

    // MARK: - Keys & escaping

    @Test("Keyword and non-identifier member keys print as bracketed strings")
    func keywordMemberKeys() throws {
        let ast = Expr.reference([.key("x"), .key("and")])
        #expect(Printer.print(ast) == "x['and']")
        // and it round-trips
        #expect(try Parser.parse(source: Printer.print(ast)) == ast)

        let hyphen = Expr.reference([.key("a"), .key("b-c")])
        #expect(Printer.print(hyphen) == "a['b-c']")
        #expect(try Parser.parse(source: Printer.print(hyphen)) == hyphen)
    }

    @Test("Keyword object keys are quoted")
    func keywordObjectKeys() throws {
        let ast = Expr.objectLiteral([ObjectEntry(key: "if", value: .literal(.int(1)))])
        #expect(Printer.print(ast) == "{'if': 1}")
        #expect(try Parser.parse(source: Printer.print(ast)) == ast)
    }

    @Test("String escaping round-trips")
    func stringEscaping() throws {
        for raw in ["a\nb", "tab\there", "it's", "back\\slash", "quote\"x"] {
            let ast = Expr.literal(.string(raw))
            let printed = Printer.print(ast)
            #expect(try Parser.parse(source: printed) == ast, "escape round-trip failed for \(raw.debugDescription)")
        }
    }

    @Test("Integral doubles keep their .0 and round-trip")
    func integralDoubles() throws {
        let ast = Expr.literal(.double(1.0))
        #expect(Printer.print(ast) == "1.0")
        #expect(try Parser.parse(source: "1.0") == ast)
    }
}
