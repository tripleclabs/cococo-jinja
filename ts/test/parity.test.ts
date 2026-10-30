import { expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { ExpressionError, evaluate, fromJSON, semanticEquals } from "../src/index.ts";

// Runs the SAME fixtures the Swift CococoJinja engine runs (FixtureParityTests):
// every `fixtures/expression/*.json` — the canonical-same-behaviour contract.
// Fixtures use NATIVE syntax: bare-identifier roots inside `{{ }}`
// (`{{ state.count }}`), NOT `$.`-rooting. A case has either `expect` (the typed
// result) or `error` (the ExpressionError phase).

type Case = { expr: string; expect?: unknown; error?: string };
type Fixture = { name: string; roots: Record<string, unknown>; cases: Case[] };

const dir = new URL("../../fixtures/expression/", import.meta.url);
const names = readdirSync(dir)
	.filter((f) => f.endsWith(".json"))
	.map((f) => f.slice(0, -".json".length))
	.sort();

test("expression fixtures load", () => {
	expect(names).toContain("parity-basic");
});

for (const name of names) {
	const fixture = JSON.parse(readFileSync(new URL(`${name}.json`, dir), "utf8")) as Fixture;

	test(`${name}: fixture loads and decodes roots + cases`, () => {
		expect(fixture.name).toBe(name);
		expect(fixture.cases.length).toBeGreaterThan(0);
	});

	for (const c of fixture.cases) {
		const label = c.expr.length > 80 ? `${c.expr.slice(0, 80)}…` : c.expr;
		test(`${name}: ${label}`, () => {
			if (c.error !== undefined) {
				let thrown: unknown;
				try {
					evaluate(c.expr, fixture.roots);
				} catch (error) {
					thrown = error;
				}
				expect(thrown).toBeInstanceOf(ExpressionError);
				expect((thrown as ExpressionError).phase).toBe(c.error as ExpressionError["phase"]);
				return;
			}
			const actual = evaluate(c.expr, fixture.roots);
			// semanticEquals (int/double equal by value), matching the Swift runner.
			expect(semanticEquals(actual, fromJSON(c.expect))).toBe(true);
		});
	}
}
