// Shared test helpers for the ported CococoJinja suites.

import { expect } from "bun:test";
import type { Expr, PathSegment, TokenKind } from "../src/ast.ts";
import { tokenKindEquals } from "../src/ast.ts";
import { ExpressionError } from "../src/errors.ts";
import { type JinjaValue, JV, semanticEquals } from "../src/index.ts";

// Value shorthands mirroring Swift's `.int(_)` etc.
export const v = {
	null: JV.null,
	bool: (b: boolean) => JV.bool(b),
	int: (n: number) => JV.int(n),
	double: (n: number) => JV.double(n),
	string: (s: string) => JV.string(s),
	array: (a: JinjaValue[]) => JV.array(a),
	object: (o: Record<string, JinjaValue>) => JV.object(o),
	date: (d: Date) => JV.date(d),
};

// Reference-path segment shorthands.
export const key = (name: string): PathSegment => ({ s: "key", name });
export const index = (i: number): PathSegment => ({ s: "index", index: i });
export const dyn = (expr: Expr): PathSegment => ({ s: "dynamic", expr });
export const ref = (...segments: PathSegment[]): Expr => ({ e: "reference", segments });
export const lit = (value: JinjaValue): Expr => ({ e: "literal", value });

/**
 * Strict structural equality on JinjaValue that DISTINGUISHES int from double
 * (unlike semanticEquals). Used where a test asserts an exact tagged value,
 * matching Swift's `==` on the enum.
 */
export function jvStrictEqual(a: JinjaValue, b: JinjaValue): boolean {
	if (a.kind !== b.kind) return false;
	switch (a.kind) {
		case "null":
			return true;
		case "bool":
			return a.value === (b as typeof a).value;
		case "int":
			return a.value === (b as typeof a).value;
		case "double":
			return a.value === (b as typeof a).value;
		case "string":
			return a.value === (b as typeof a).value;
		case "date":
			return a.value.getTime() === (b as typeof a).value.getTime();
		case "array": {
			const bb = (b as typeof a).value;
			if (a.value.length !== bb.length) return false;
			return a.value.every((x, i) => jvStrictEqual(x, bb[i]!));
		}
		case "object": {
			const bb = (b as typeof a).value;
			if (a.value.size !== bb.size) return false;
			for (const [k, av] of a.value) {
				const bv = bb.get(k);
				if (bv === undefined || !jvStrictEqual(av, bv)) return false;
			}
			return true;
		}
	}
}

/** Assert two values are strictly equal (int != double). */
export function expectValue(actual: JinjaValue, expected: JinjaValue): void {
	expect(jvStrictEqual(actual, expected)).toBe(true);
}

/** Assert two values are semantically equal (int == double by value). */
export function expectSemantic(actual: JinjaValue, expected: JinjaValue): void {
	expect(semanticEquals(actual, expected)).toBe(true);
}

/** Assert a thunk throws an ExpressionError. */
export function expectThrowsExpressionError(fn: () => unknown): void {
	let thrown: unknown;
	try {
		fn();
	} catch (e) {
		thrown = e;
	}
	expect(thrown).toBeInstanceOf(ExpressionError);
}

/** Structural equality of token-kind arrays. */
export function tokenKindsEqual(a: TokenKind[], b: TokenKind[]): boolean {
	if (a.length !== b.length) return false;
	return a.every((k, i) => tokenKindEquals(k, b[i]!));
}

// Structural AST equality (used by parser & template tests).
export function exprEqual(a: Expr, b: Expr): boolean {
	if (a.e !== b.e) return false;
	switch (a.e) {
		case "literal":
			return jvStrictEqual(a.value, (b as typeof a).value);
		case "reference": {
			const bs = (b as typeof a).segments;
			if (a.segments.length !== bs.length) return false;
			return a.segments.every((s, i) => segEqual(s, bs[i]!));
		}
		case "unary": {
			const bb = b as typeof a;
			return a.op === bb.op && exprEqual(a.operand, bb.operand);
		}
		case "binary": {
			const bb = b as typeof a;
			return a.op === bb.op && exprEqual(a.lhs, bb.lhs) && exprEqual(a.rhs, bb.rhs);
		}
		case "logical": {
			const bb = b as typeof a;
			if (a.op !== bb.op || a.operands.length !== bb.operands.length) return false;
			return a.operands.every((o, i) => exprEqual(o, bb.operands[i]!));
		}
		case "conditional": {
			const bb = b as typeof a;
			return (
				exprEqual(a.condition, bb.condition) &&
				exprEqual(a.then, bb.then) &&
				exprEqual(a.otherwise, bb.otherwise)
			);
		}
		case "filter": {
			const bb = b as typeof a;
			if (a.name !== bb.name || a.arguments.length !== bb.arguments.length) return false;
			return (
				exprEqual(a.input, bb.input) &&
				a.arguments.every((x, i) => exprEqual(x, bb.arguments[i]!))
			);
		}
		case "arrayLiteral": {
			const bb = b as typeof a;
			if (a.elements.length !== bb.elements.length) return false;
			return a.elements.every((x, i) => exprEqual(x, bb.elements[i]!));
		}
		case "objectLiteral": {
			const bb = b as typeof a;
			if (a.entries.length !== bb.entries.length) return false;
			return a.entries.every(
				(en, i) => en.key === bb.entries[i]!.key && exprEqual(en.value, bb.entries[i]!.value),
			);
		}
	}
}

function segEqual(a: PathSegment, b: PathSegment): boolean {
	if (a.s !== b.s) return false;
	if (a.s === "key") return a.name === (b as typeof a).name;
	if (a.s === "index") return a.index === (b as typeof a).index;
	if (a.s === "dynamic") return exprEqual(a.expr, (b as typeof a).expr);
	return false;
}

export function expectExpr(actual: Expr, expected: Expr): void {
	expect(exprEqual(actual, expected)).toBe(true);
}
