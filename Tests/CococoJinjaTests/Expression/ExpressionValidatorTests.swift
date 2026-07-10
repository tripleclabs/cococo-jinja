//
//  ExpressionValidatorTests.swift
//  CococoJinjaTests
//
//  Copyright Triple C Labs GmbH
//

import Foundation
import Testing

@testable import CococoJinja

@Suite("Expression validator")
struct ExpressionValidatorTests {

    // MARK: - Predicate

    @Test("Valid predicate validates clean")
    func validPredicate() {
        let r = ExpressionValidator.validate("input.age >= 18 and input.role == 'admin'", format: .predicate)
        #expect(r.success)
        #expect(r.diagnostics.isEmpty)
    }

    @Test("Predicate also accepts a single braced span")
    func bracedPredicate() {
        let r = ExpressionValidator.validate("{{ input.age >= 18 }}", format: .predicate)
        #expect(r.success)
    }

    @Test("Malformed predicate reports a parse diagnostic with position")
    func malformedPredicate() {
        let r = ExpressionValidator.validate("input.age >", format: .predicate)
        #expect(!r.success)
        #expect(r.diagnostics.count == 1)
        let d = r.diagnostics[0]
        #expect(d.severity == .error)
        #expect(d.phase == "parse")
        #expect(d.line == 1)
        #expect(d.column >= 1)
    }

    @Test("Empty predicate is invalid")
    func emptyPredicate() {
        #expect(!ExpressionValidator.validate("", format: .predicate).success)
    }

    // MARK: - Template

    @Test("Valid template (plaintext + spans) validates clean")
    func validTemplate() {
        let r = ExpressionValidator.validate("Hello {{ input.name }}, you have {{ input.count }} items", format: .template)
        #expect(r.success)
        #expect(r.diagnostics.isEmpty)
    }

    @Test("Pure plaintext and empty template are valid")
    func plaintextTemplate() {
        #expect(ExpressionValidator.validate("just text", format: .template).success)
        #expect(ExpressionValidator.validate("", format: .template).success)
    }

    @Test("Unterminated span reports a diagnostic")
    func unterminatedSpan() {
        let r = ExpressionValidator.validate("Hello {{ input.name", format: .template)
        #expect(!r.success)
        #expect(r.diagnostics.first?.severity == .error)
    }

    @Test("Malformed expression inside a span reports a rebased position")
    func malformedSpan() {
        let r = ExpressionValidator.validate("ok {{ 1 2 }}", format: .template)
        #expect(!r.success)
        let d = try! #require(r.diagnostics.first)
        #expect(d.phase == "parse")
        #expect(d.offset == 8) // the offending '2' in the full source
    }

    // MARK: - Filter checks

    @Test("Unknown filter is flagged")
    func unknownFilter() {
        let r = ExpressionValidator.validate("{{ input.x | nope }}", format: .template)
        #expect(!r.success)
        #expect(r.diagnostics.contains { $0.phase == "filter" && $0.message.contains("nope") })
    }

    @Test("Known filters validate clean (incl. chains)")
    func knownFilters() {
        #expect(ExpressionValidator.validate("{{ input.tags | join(', ') }}", format: .template).success)
        #expect(ExpressionValidator.validate("input.items | length | abs", format: .predicate).success)
        #expect(ExpressionValidator.validate("{{ a | merge(b) | pick('x') }}", format: .template).success)
    }

    @Test("Unknown filters are de-duplicated")
    func dedupedUnknownFilters() {
        let r = ExpressionValidator.validate("{{ (a | bogus) ~ (b | bogus) }}", format: .template)
        #expect(r.diagnostics.filter { $0.phase == "filter" }.count == 1)
    }

    // MARK: - Position mapping

    @Test("Line/column reflect multi-line source")
    func multilinePosition() {
        // Parse error on line 3.
        let source = "a == 1\nand b == 2\nand c >"
        let r = ExpressionValidator.validate(source, format: .predicate)
        #expect(!r.success)
        #expect(r.diagnostics.first?.line == 3)
    }
}
