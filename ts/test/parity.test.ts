import { expect, test } from "bun:test";
import parityBasic from "../../fixtures/expression/parity-basic.json" with { type: "json" };
import { evaluate, fromJSON, semanticEquals } from "../src/index.ts";

// Runs the SAME fixture the Swift CococoJinja engine runs (FixtureParityTests) —
// the canonical-same-behaviour contract. The fixture uses NATIVE syntax:
// bare-identifier roots inside `{{ }}` (`{{ state.count }}`), NOT `$.`-rooting.

type Case = { expr: string; expect: unknown };
const fixture = parityBasic as {
	name: string;
	roots: Record<string, unknown>;
	cases: Case[];
};

test("fixture loads and decodes roots + cases", () => {
	expect(fixture.name).toBe("parity-basic");
	expect(fixture.cases.length).toBeGreaterThan(0);
});

for (const c of fixture.cases) {
	test(`parity: ${c.expr}`, () => {
		const actual = evaluate(c.expr, fixture.roots);
		const expected = fromJSON(c.expect);
		// Compare with semanticEquals (int/double equal by value), matching the
		// Swift FixtureParityTests comparison.
		expect(semanticEquals(actual, expected)).toBe(true);
	});
}
