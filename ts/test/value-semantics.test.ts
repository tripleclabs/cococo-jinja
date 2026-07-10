// Ported from Tests/CococoJinjaTests/Expression/ValueSemanticsTests.swift

import { describe, expect, test } from "bun:test";
import {
	isTruthy,
	JV,
	orderedAscending,
	orderedDescending,
	orderedSame,
	renderedString,
	semanticCompare,
	semanticEquals,
} from "../src/index.ts";
import { expectThrowsExpressionError } from "./helpers.ts";

describe("Expression value semantics", () => {
	// Truthiness
	test("Falsy values", () => {
		expect(isTruthy(JV.null)).toBe(false);
		expect(isTruthy(JV.bool(false))).toBe(false);
		expect(isTruthy(JV.int(0))).toBe(false);
		expect(isTruthy(JV.double(0))).toBe(false);
		expect(isTruthy(JV.string(""))).toBe(false);
		expect(isTruthy(JV.array([]))).toBe(false);
		expect(isTruthy(JV.object({}))).toBe(false);
	});

	test("Truthy values, including any date", () => {
		expect(isTruthy(JV.bool(true))).toBe(true);
		expect(isTruthy(JV.int(1))).toBe(true);
		expect(isTruthy(JV.int(-1))).toBe(true);
		expect(isTruthy(JV.double(0.1))).toBe(true);
		expect(isTruthy(JV.string("x"))).toBe(true);
		expect(isTruthy(JV.array([JV.int(0)]))).toBe(true);
		expect(isTruthy(JV.object({ k: JV.null }))).toBe(true);
		expect(isTruthy(JV.date(new Date(0)))).toBe(true);
	});

	// Semantic equality
	test("Numeric equality across int/double", () => {
		expect(semanticEquals(JV.int(1), JV.double(1.0))).toBe(true);
		expect(semanticEquals(JV.double(2.0), JV.int(2))).toBe(true);
		expect(semanticEquals(JV.int(3), JV.int(3))).toBe(true);
		expect(semanticEquals(JV.int(1), JV.double(1.5))).toBe(false);
	});

	test("Cross-type equality is false, never an error", () => {
		expect(semanticEquals(JV.int(1), JV.string("1"))).toBe(false);
		expect(semanticEquals(JV.null, JV.int(0))).toBe(false);
		expect(semanticEquals(JV.bool(true), JV.int(1))).toBe(false);
		expect(semanticEquals(JV.null, JV.bool(false))).toBe(false);
	});

	test("Scalar equality by type", () => {
		expect(semanticEquals(JV.string("a"), JV.string("a"))).toBe(true);
		expect(semanticEquals(JV.string("a"), JV.string("b"))).toBe(false);
		expect(semanticEquals(JV.bool(true), JV.bool(true))).toBe(true);
		expect(semanticEquals(JV.null, JV.null)).toBe(true);
		const d = new Date(1000 * 1000);
		expect(semanticEquals(JV.date(d), JV.date(new Date(d.getTime())))).toBe(true);
		expect(semanticEquals(JV.date(d), JV.date(new Date(d.getTime() + 1000)))).toBe(false);
	});

	test("Deep array and object equality uses semantic rules", () => {
		expect(
			semanticEquals(
				JV.array([JV.int(1), JV.double(2.0)]),
				JV.array([JV.double(1.0), JV.int(2)]),
			),
		).toBe(true);
		expect(semanticEquals(JV.array([JV.int(1)]), JV.array([JV.int(1), JV.int(2)]))).toBe(false);
		expect(
			semanticEquals(
				JV.object({ a: JV.int(1), b: JV.double(2.0) }),
				JV.object({ b: JV.int(2), a: JV.double(1.0) }),
			),
		).toBe(true);
		expect(
			semanticEquals(JV.object({ a: JV.int(1) }), JV.object({ a: JV.int(1), b: JV.int(2) })),
		).toBe(false);
	});

	// Ordered comparison
	test("Numeric ordering across int/double", () => {
		expect(semanticCompare(JV.int(1), JV.int(2))).toBe(orderedAscending);
		expect(semanticCompare(JV.double(2.5), JV.int(2))).toBe(orderedDescending);
		expect(semanticCompare(JV.int(3), JV.double(3.0))).toBe(orderedSame);
	});

	test("String ordering is lexicographic", () => {
		expect(semanticCompare(JV.string("a"), JV.string("b"))).toBe(orderedAscending);
		expect(semanticCompare(JV.string("b"), JV.string("a"))).toBe(orderedDescending);
		expect(semanticCompare(JV.string("a"), JV.string("a"))).toBe(orderedSame);
	});

	test("Date ordering is chronological", () => {
		const early = JV.date(new Date(0));
		const late = JV.date(new Date(100 * 1000));
		expect(semanticCompare(early, late)).toBe(orderedAscending);
		expect(semanticCompare(late, early)).toBe(orderedDescending);
	});

	test("Ordering mismatched or non-orderable types throws", () => {
		expectThrowsExpressionError(() => semanticCompare(JV.int(1), JV.string("1")));
		expectThrowsExpressionError(() => semanticCompare(JV.bool(true), JV.bool(false)));
		expectThrowsExpressionError(() => semanticCompare(JV.null, JV.null));
	});

	// Text rendering
	test("Scalar rendering", () => {
		expect(renderedString(JV.null)).toBe("");
		expect(renderedString(JV.bool(true))).toBe("true");
		expect(renderedString(JV.bool(false))).toBe("false");
		expect(renderedString(JV.int(42))).toBe("42");
		expect(renderedString(JV.string("hello"))).toBe("hello");
	});

	test("Date renders as ISO8601 UTC", () => {
		expect(renderedString(JV.date(new Date(0)))).toBe("1970-01-01T00:00:00Z");
	});

	test("Array and object render as JSON", () => {
		expect(renderedString(JV.array([JV.int(1), JV.int(2)]))).toBe("[1,2]");
	});
});
