import { expect, test } from "bun:test";
import parityBasic from "../../fixtures/expression/parity-basic.json" with { type: "json" };
import { evaluate } from "../src/index.ts";

type Case = { expr: string; expect: unknown };
const fixture = parityBasic as { roots: Record<string, never>; cases: Case[] };

// These load the SAME fixtures the Swift CococoJinja engine runs — the
// canonical-same-behaviour contract. Skipped until the TS evaluator is ported;
// flip `test.skip` to `test` then.
for (const c of fixture.cases) {
	test.skip(`parity: ${c.expr}`, () => {
		expect(evaluate(c.expr, fixture.roots)).toEqual(c.expect);
	});
}
