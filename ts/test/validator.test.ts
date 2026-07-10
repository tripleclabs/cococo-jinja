// Ported from Tests/CococoJinjaTests/Expression/ExpressionValidatorTests.swift

import { describe, expect, test } from "bun:test";
import { validate } from "../src/index.ts";

describe("Expression validator", () => {
	// Predicate
	test("Valid predicate validates clean", () => {
		const r = validate("input.age >= 18 and input.role == 'admin'", "PREDICATE");
		expect(r.success).toBe(true);
		expect(r.diagnostics.length).toBe(0);
	});

	test("Predicate also accepts a single braced span", () => {
		expect(validate("{{ input.age >= 18 }}", "PREDICATE").success).toBe(true);
	});

	test("Malformed predicate reports a parse diagnostic with position", () => {
		const r = validate("input.age >", "PREDICATE");
		expect(r.success).toBe(false);
		expect(r.diagnostics.length).toBe(1);
		const d = r.diagnostics[0]!;
		expect(d.severity).toBe("ERROR");
		expect(d.phase).toBe("parse");
		expect(d.line).toBe(1);
		expect(d.column).toBeGreaterThanOrEqual(1);
	});

	test("Empty predicate is invalid", () => {
		expect(validate("", "PREDICATE").success).toBe(false);
	});

	// Template
	test("Valid template (plaintext + spans) validates clean", () => {
		const r = validate(
			"Hello {{ input.name }}, you have {{ input.count }} items",
			"TEMPLATE",
		);
		expect(r.success).toBe(true);
		expect(r.diagnostics.length).toBe(0);
	});

	test("Pure plaintext and empty template are valid", () => {
		expect(validate("just text", "TEMPLATE").success).toBe(true);
		expect(validate("", "TEMPLATE").success).toBe(true);
	});

	test("Unterminated span reports a diagnostic", () => {
		const r = validate("Hello {{ input.name", "TEMPLATE");
		expect(r.success).toBe(false);
		expect(r.diagnostics[0]?.severity).toBe("ERROR");
	});

	test("Malformed expression inside a span reports a rebased position", () => {
		const r = validate("ok {{ 1 2 }}", "TEMPLATE");
		expect(r.success).toBe(false);
		const d = r.diagnostics[0]!;
		expect(d.phase).toBe("parse");
		expect(d.offset).toBe(8);
	});

	// Filter checks
	test("Unknown filter is flagged", () => {
		const r = validate("{{ input.x | nope }}", "TEMPLATE");
		expect(r.success).toBe(false);
		expect(r.diagnostics.some((d) => d.phase === "filter" && d.message.includes("nope"))).toBe(
			true,
		);
	});

	test("Known filters validate clean (incl. chains)", () => {
		expect(validate("{{ input.tags | join(', ') }}", "TEMPLATE").success).toBe(true);
		expect(validate("input.items | length | abs", "PREDICATE").success).toBe(true);
		expect(validate("{{ a | merge(b) | pick('x') }}", "TEMPLATE").success).toBe(true);
	});

	test("Unknown filters are de-duplicated", () => {
		const r = validate("{{ (a | bogus) ~ (b | bogus) }}", "TEMPLATE");
		expect(r.diagnostics.filter((d) => d.phase === "filter").length).toBe(1);
	});

	// Position mapping
	test("Line/column reflect multi-line source", () => {
		const source = "a == 1\nand b == 2\nand c >";
		const r = validate(source, "PREDICATE");
		expect(r.success).toBe(false);
		expect(r.diagnostics[0]?.line).toBe(3);
	});
});
