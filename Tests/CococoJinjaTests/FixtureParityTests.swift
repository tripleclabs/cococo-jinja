//
//  FixtureParityTests.swift
//  CococoJinjaTests
//
//  Copyright Triple C Labs GmbH
//
//  Runs `fixtures/expression/parity-basic.json` — the language-neutral parity
//  suite shared with the @cococo/jinja TS peer — against this engine.
//
//  The fixture uses the engine's NATIVE syntax: a single root `JinjaValue.object`
//  whose top-level keys (`state`, …) are addressed by BARE identifiers inside
//  `{{ }}` (`{{ state.count }}`, `{{ state.items[0] }}`). The `$.`-rooted form
//  (`$.state.x`) is a SURFACE-LAYER feature (cococo-surfaces / SurfaceKit), not
//  part of this engine — `dollarRootingIsSurfaceLayer` documents that.
//

import Foundation
import Testing

@testable import CococoJinja

@Suite("Fixture parity — parity-basic.json")
struct FixtureParityTests {

    private struct Fixture: Decodable {
        let name: String
        let roots: JinjaValue
        let cases: [Case]
        struct Case: Decodable {
            let expr: String
            let expect: JinjaValue
        }
    }

    /// Load the fixture from the repo root, located relative to this source file
    /// (`Tests/CococoJinjaTests/…` → up three dirs).
    private static func loadFixture() throws -> Fixture {
        let repoRoot = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // CococoJinjaTests/
            .deletingLastPathComponent()   // Tests/
            .deletingLastPathComponent()   // repo root
        let url = repoRoot
            .appendingPathComponent("fixtures")
            .appendingPathComponent("expression")
            .appendingPathComponent("parity-basic.json")
        return try JSONDecoder().decode(Fixture.self, from: Data(contentsOf: url))
    }

    @Test("Fixture loads and decodes roots + cases")
    func fixtureLoads() throws {
        let fixture = try Self.loadFixture()
        #expect(fixture.name == "parity-basic")
        #expect(!fixture.cases.isEmpty)
        #expect(fixture.roots["state"]?["count"] == .int(3))
    }

    @Test("Every fixture case evaluates to its expected value")
    func parity() throws {
        let fixture = try Self.loadFixture()
        var failures: [String] = []
        for c in fixture.cases {
            do {
                let actual = try ExpressionTemplate.evaluate(c.expr, context: fixture.roots)
                if !JinjaValue.semanticEquals(actual, c.expect) {
                    failures.append("[\(c.expr)] expected \(c.expect) but got \(actual)")
                }
            } catch {
                failures.append("[\(c.expr)] threw \(error)")
            }
        }
        if !failures.isEmpty {
            Issue.record(Comment(rawValue: "Fixture parity failures:\n" + failures.joined(separator: "\n")))
        }
        #expect(failures.isEmpty)
    }

    /// Documents that `$.`-rooting is a surface-layer feature, not the raw engine.
    @Test("`$.` rooting is a surface-layer feature, not the raw engine")
    func dollarRootingIsSurfaceLayer() throws {
        let context = try Self.loadFixture().roots

        // A braced `$.` span fails to lex — `$` is not a valid identifier char.
        #expect(throws: ExpressionError.self) {
            _ = try ExpressionTemplate.evaluate("{{ $.state.count }}", context: context)
        }

        // An unbraced `$.state.count` is plain text — never a path lookup.
        #expect(try ExpressionTemplate.evaluate("$.state.count", context: context) == .string("$.state.count"))
    }
}
