// Ported from Tests/CococoJinjaTests/Expression/ExpressionTemplateTests.swift

import { describe, expect, test } from "bun:test";
import {
	ExpressionError,
	type JinjaValue,
	JV,
	singleExpression,
	templateEvaluate,
	templateRender,
} from "../src/index.ts";
import { expectExpr, expectThrowsExpressionError, expectValue, key, lit, ref, v } from "./helpers.ts";

const context: JinjaValue = JV.object({
	input: JV.object({
		age: JV.int(25),
		name: JV.string("Ada"),
		items: JV.array([JV.int(1), JV.int(2)]),
		createdAt: JV.date(new Date(0)),
		maybe: JV.null,
	}),
});

const evaluate = (source: string): JinjaValue => templateEvaluate(source, context);
const render = (source: string): string => templateRender(source, context);

describe("Expression template / smart evaluator", () => {
	test("A single expression span returns a typed value", () => {
		expectValue(evaluate("{{ input.age >= 18 }}"), v.bool(true));
		expectValue(evaluate("{{ input.age }}"), v.int(25));
		expectValue(evaluate("{{ input.items }}"), v.array([v.int(1), v.int(2)]));
		expectValue(evaluate("{{ input.age + 5 }}"), v.int(30));
	});

	test("Surrounding whitespace still counts as a single expression", () => {
		expectValue(evaluate("  {{ input.age }}  "), v.int(25));
		expectValue(evaluate("\n{{ input.age }}\n"), v.int(25));
	});

	test("Pure plaintext returns the string verbatim", () => {
		expectValue(evaluate("Just regular text"), v.string("Just regular text"));
		expectValue(evaluate("no braces here"), v.string("no braces here"));
	});

	test("Mixed text and expression renders to a string", () => {
		expectValue(evaluate("User is {{ input.name }}"), v.string("User is Ada"));
		expectValue(evaluate("{{ input.name }} is {{ input.age }}"), v.string("Ada is 25"));
	});

	test("Multiple expressions force string rendering even with no literal text", () => {
		expectValue(evaluate("{{ input.name }}{{ input.age }}"), v.string("Ada25"));
	});

	test("Interpolation renders types per the string projection", () => {
		expect(render("{{ input.maybe }}")).toBe("");
		expect(render("{{ input.age }}")).toBe("25");
		expect(render("{{ input.items }}")).toBe("[1,2]");
		expect(render("{{ input.createdAt }}")).toBe("1970-01-01T00:00:00Z");
		expect(render("at {{ input.createdAt }}!")).toBe("at 1970-01-01T00:00:00Z!");
	});

	test("render() always returns a string, even for a single expression", () => {
		expect(render("{{ input.age >= 18 }}")).toBe("true");
		expect(render("{{ input.age }}")).toBe("25");
	});

	test("Single braces are literal text, not a span", () => {
		expectValue(evaluate("a { b } c"), v.string("a { b } c"));
		expectValue(evaluate("{ not a span }"), v.string("{ not a span }"));
	});

	test("singleExpression recovers the AST for a single span", () => {
		const e1 = singleExpression("{{ input.age >= 18 }}");
		expect(e1).toBeDefined();
		expectExpr(e1!, {
			e: "binary",
			op: ">=",
			lhs: ref(key("input"), key("age")),
			rhs: lit(v.int(18)),
		});
		const e2 = singleExpression("  {{ x }}  ");
		expect(e2).toBeDefined();
		expectExpr(e2!, ref(key("x")));
	});

	test("singleExpression returns nil for plaintext, mixed, and multi-span", () => {
		expect(singleExpression("plain")).toBeUndefined();
		expect(singleExpression("x is {{ y }}")).toBeUndefined();
		expect(singleExpression("{{ a }}{{ b }}")).toBeUndefined();
	});

	test("Unterminated span throws", () => {
		expectThrowsExpressionError(() => evaluate("{{ input.age "));
	});

	test("Malformed expression in a span throws with a rebased offset", () => {
		let err: unknown;
		try {
			evaluate("ok {{ 1 2 }}");
		} catch (e) {
			err = e;
		}
		expect(err).toBeInstanceOf(ExpressionError);
		expect((err as ExpressionError).phase).toBe("parse");
		expect((err as ExpressionError).offset).toBe(8);
	});
});
