import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import {
	decodeJinjaValueString,
	fromJSONString,
	type JinjaValue,
	JV,
} from "../src/index.ts";
import { jvStrictEqual } from "./helpers.ts";

// Runs `fixtures/value/json-decoding.json`, shared with the Swift
// JSONDecodingFixtureTests. `plain` → fromJSONString (Swift fromJSONString /
// fromJSONData); `legacy` → decodeJinjaValueString (Swift JSONDecoder with
// `JinjaValue.decodeLegacyTaggedEnvelopes`). Comparison is strict: int ≠ double.

type Case = { id: string; mode: "plain" | "legacy"; json: string; expect?: unknown; error?: boolean };
const fixture = JSON.parse(
	readFileSync(new URL("../../fixtures/value/json-decoding.json", import.meta.url), "utf8"),
) as { name: string; cases: Case[] };

/** The fixture's tagged expectation form ({int: 1}, {double: 1.5}, …). */
function tagged(json: unknown): JinjaValue {
	if (json === null) return JV.null;
	const [tag, value] = Object.entries(json as Record<string, unknown>)[0]!;
	switch (tag) {
		case "int":
			return JV.int(value as number);
		case "double":
			return JV.double(value as number);
		case "bool":
			return JV.bool(value as boolean);
		case "string":
			return JV.string(value as string);
		case "array":
			return JV.array((value as unknown[]).map(tagged));
		case "object":
			return JV.object(
				Object.fromEntries(
					Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, tagged(v)]),
				),
			);
		default:
			throw new Error(`unknown tag ${tag}`);
	}
}

test("json-decoding fixture loads", () => {
	expect(fixture.name).toBe("json-decoding");
	expect(fixture.cases.length).toBeGreaterThan(0);
});

for (const c of fixture.cases) {
	test(`json-decoding: ${c.id} ${c.json}`, () => {
		const decode = c.mode === "plain" ? fromJSONString : decodeJinjaValueString;
		if (c.error) {
			expect(() => decode(c.json)).toThrow();
			return;
		}
		const actual = decode(c.json);
		const expected = tagged(c.expect);
		if (!jvStrictEqual(actual, expected)) {
			throw new Error(`expected ${JSON.stringify(c.expect)} but got ${JSON.stringify(actual, (_k, v) => (v instanceof Map ? Object.fromEntries(v) : v))}`);
		}
	});
}
