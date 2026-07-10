// Ported from Tests/CococoJinjaTests/Expression/FiltersTests.swift

import { describe, expect, test } from "bun:test";
import {
	evaluateExpr,
	FilterRegistry,
	type JinjaValue,
	JV,
	parseSource,
} from "../src/index.ts";
import { expectThrowsExpressionError, expectValue, v } from "./helpers.ts";

function evalExpr(source: string): JinjaValue {
	return evaluateExpr(parseSource(source), JV.object({}), FilterRegistry.standard);
}

describe("Expression standard filters", () => {
	test("default substitutes only for null", () => {
		expectValue(evalExpr("null | default('x')"), v.string("x"));
		expectValue(evalExpr("5 | default(0)"), v.int(5));
		expectValue(evalExpr("'' | default('x')"), v.string(""));
		expectValue(evalExpr("0 | default(9)"), v.int(0));
	});

	test("default requires exactly one argument", () => {
		expectThrowsExpressionError(() => evalExpr("null | default"));
		expectThrowsExpressionError(() => evalExpr("null | default(1, 2)"));
	});

	test("length of array, object, string", () => {
		expectValue(evalExpr("[1, 2, 3] | length"), v.int(3));
		expectValue(evalExpr("{a: 1, b: 2} | length"), v.int(2));
		expectValue(evalExpr("'hello' | length"), v.int(5));
	});

	test("length of a scalar throws", () => {
		expectThrowsExpressionError(() => evalExpr("5 | length"));
	});

	test("min and max over arrays", () => {
		expectValue(evalExpr("[3, 1, 2] | min"), v.int(1));
		expectValue(evalExpr("[3, 1, 2] | max"), v.int(3));
		expectValue(evalExpr("['b', 'a', 'c'] | max"), v.string("c"));
		expectValue(evalExpr("[1, 2.5, 2] | max"), v.double(2.5));
	});

	test("min/max on empty or non-array throws", () => {
		expectThrowsExpressionError(() => evalExpr("[] | min"));
		expectThrowsExpressionError(() => evalExpr("5 | max"));
		expectThrowsExpressionError(() => evalExpr("[1, 'a'] | max"));
	});

	test("lower, upper, trim", () => {
		expectValue(evalExpr("'HeLLo' | lower"), v.string("hello"));
		expectValue(evalExpr("'HeLLo' | upper"), v.string("HELLO"));
		expectValue(evalExpr("'  spaced  ' | trim"), v.string("spaced"));
	});

	test("string filters reject non-strings", () => {
		expectThrowsExpressionError(() => evalExpr("5 | lower"));
		expectThrowsExpressionError(() => evalExpr("5 | trim"));
	});

	test("join with and without a separator", () => {
		expectValue(evalExpr("['a', 'b', 'c'] | join(', ')"), v.string("a, b, c"));
		expectValue(evalExpr("[1, 2, 3] | join"), v.string("123"));
	});

	test("join on a non-array throws", () => {
		expectThrowsExpressionError(() => evalExpr("'abc' | join(',')"));
	});

	test("abs preserves numeric type", () => {
		expectValue(evalExpr("(-5) | abs"), v.int(5));
		expectValue(evalExpr("(-2.5) | abs"), v.double(2.5));
		expectValue(evalExpr("-5 | abs"), v.int(-5)); // == -(5 | abs)
	});

	test("round with optional precision", () => {
		expectValue(evalExpr("2.4 | round"), v.double(2.0));
		expectValue(evalExpr("2.5 | round"), v.double(3.0));
		expectValue(evalExpr("3.14159 | round(2)"), v.double(3.14));
	});

	test("abs/round reject non-numbers", () => {
		expectThrowsExpressionError(() => evalExpr("'x' | abs"));
		expectThrowsExpressionError(() => evalExpr("'x' | round"));
	});

	test("merge overlays the argument object", () => {
		expectValue(
			evalExpr("{a: 1, b: 2} | merge({b: 3, c: 4})"),
			v.object({ a: v.int(1), b: v.int(3), c: v.int(4) }),
		);
	});

	test("merge requires two objects", () => {
		expectThrowsExpressionError(() => evalExpr("5 | merge({a: 1})"));
		expectThrowsExpressionError(() => evalExpr("{a: 1} | merge(5)"));
	});

	test("pick keeps only listed, present keys", () => {
		expectValue(
			evalExpr("{a: 1, b: 2, c: 3} | pick('a', 'c')"),
			v.object({ a: v.int(1), c: v.int(3) }),
		);
		expectValue(evalExpr("{a: 1} | pick('a', 'missing')"), v.object({ a: v.int(1) }));
	});

	test("omit drops listed keys", () => {
		expectValue(
			evalExpr("{a: 1, b: 2, c: 3} | omit('b')"),
			v.object({ a: v.int(1), c: v.int(3) }),
		);
	});

	test("pick/omit require an object input and string keys", () => {
		expectThrowsExpressionError(() => evalExpr("5 | pick('a')"));
		expectThrowsExpressionError(() => evalExpr("{a: 1} | omit(5)"));
	});

	test("concat of arrays and of strings", () => {
		expectValue(
			evalExpr("[1, 2] | concat([3, 4])"),
			v.array([v.int(1), v.int(2), v.int(3), v.int(4)]),
		);
		expectValue(evalExpr("'ab' | concat('cd')"), v.string("abcd"));
	});

	test("concat rejects mixed/other types", () => {
		expectThrowsExpressionError(() => evalExpr("[1] | concat('x')"));
		expectThrowsExpressionError(() => evalExpr("5 | concat(6)"));
	});

	test("filters chain", () => {
		expectValue(evalExpr("'  HeLLo  ' | trim | lower"), v.string("hello"));
		expectValue(evalExpr("[3, 1, 2] | max | abs"), v.int(3));
	});

	test("standard registry exposes exactly the documented allowlist", () => {
		const names = FilterRegistry.standard.names;
		const expected = [
			"default",
			"length",
			"min",
			"max",
			"lower",
			"upper",
			"trim",
			"join",
			"abs",
			"round",
			"merge",
			"pick",
			"omit",
			"concat",
		];
		expect(names.size).toBe(expected.length);
		for (const n of expected) expect(names.has(n)).toBe(true);
	});
});
