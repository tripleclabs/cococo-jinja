//
//  FixtureParityTests.swift
//  CococoJinjaTests
//
//  Copyright Triple C Labs GmbH
//
//  Runs every `fixtures/expression/*.json` file — the language-neutral parity
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

/// Hands a result back from the large-stack thread; the semaphore orders access.
private final class ResultBox: @unchecked Sendable {
    var result: Result<JinjaValue, Error>?
}

@Suite("Fixture parity — fixtures/expression")
struct FixtureParityTests {

    private struct Fixture: Decodable {
        let name: String
        let roots: JinjaValue
        let cases: [Case]
        struct Case: Decodable {
            let expr: String
            /// The typed result, or nil when the case expects an error.
            let expect: JinjaValue?
            /// The expected `ExpressionError.Phase` raw value.
            let error: String?

            private enum CodingKeys: String, CodingKey { case expr, expect, error }

            init(from decoder: Decoder) throws {
                let container = try decoder.container(keyedBy: CodingKeys.self)
                expr = try container.decode(String.self, forKey: .expr)
                error = try container.decodeIfPresent(String.self, forKey: .error)
                // `"expect": null` is a real expectation (.null), not an absent one.
                expect = container.contains(.expect) ? try container.decode(JinjaValue.self, forKey: .expect) : nil
            }
        }
    }

    private static var expressionFixtureDirectory: URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // CococoJinjaTests/
            .deletingLastPathComponent()   // Tests/
            .deletingLastPathComponent()   // repo root
            .appendingPathComponent("fixtures")
            .appendingPathComponent("expression")
    }

    private static func loadFixture(_ name: String = "parity-basic") throws -> Fixture {
        let url = expressionFixtureDirectory.appendingPathComponent("\(name).json")
        return try JSONDecoder().decode(Fixture.self, from: Data(contentsOf: url))
    }

    /// Every fixture file in `fixtures/expression/`, by name (without `.json`).
    static let fixtureNames: [String] = {
        let files = (try? FileManager.default.contentsOfDirectory(atPath: expressionFixtureDirectory.path)) ?? []
        return files.filter { $0.hasSuffix(".json") }.map { String($0.dropLast(5)) }.sorted()
    }()

    @Test("Fixture loads and decodes roots + cases")
    func fixtureLoads() throws {
        let fixture = try Self.loadFixture()
        #expect(fixture.name == "parity-basic")
        #expect(!fixture.cases.isEmpty)
        #expect(fixture.roots["state"]?["count"] == .int(3))
    }

    @Test("Every fixture case evaluates to its expected value", arguments: fixtureNames)
    func parity(name: String) throws {
        let fixture = try Self.loadFixture(name)
        #expect(fixture.name == name)
        #expect(!fixture.cases.isEmpty)
        var failures: [String] = []
        for c in fixture.cases {
            let label = c.expr.count > 80 ? String(c.expr.prefix(80)) + "…" : c.expr
            do {
                let actual = try Self.onWorkerSizedStack { try ExpressionTemplate.evaluate(c.expr, context: fixture.roots) }
                if let phase = c.error {
                    failures.append("[\(label)] expected a \(phase) error but got \(actual)")
                } else if let expected = c.expect, !JinjaValue.semanticEquals(actual, expected) {
                    failures.append("[\(label)] expected \(expected) but got \(actual)")
                }
            } catch let error as ExpressionError {
                if c.error != error.phase.rawValue {
                    failures.append("[\(label)] threw \(error)")
                }
            } catch {
                failures.append("[\(label)] threw \(error)")
            }
        }
        if !failures.isEmpty {
            Issue.record(Comment(rawValue: "Fixture parity failures:\n" + failures.joined(separator: "\n")))
        }
        #expect(failures.isEmpty)
    }

    /// Runs `body` on a thread with a 512 KiB stack, the size of a Swift
    /// Testing worker thread.
    ///
    /// The nesting-budget cases drive the recursive-descent parser to its
    /// 256-step recursion bound. Pinning the stack size makes the suite prove
    /// that bound is reached, and throws, before an unoptimised (debug) build
    /// overflows a worker stack, whatever thread the runner happens to use.
    private static func onWorkerSizedStack(_ body: @escaping @Sendable () throws -> JinjaValue) throws -> JinjaValue {
        let box = ResultBox()
        let done = DispatchSemaphore(value: 0)
        let thread = Thread {
            box.result = Result { try body() }
            done.signal()
        }
        thread.stackSize = 512 << 10
        thread.start()
        done.wait()
        return try box.result!.get()
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
