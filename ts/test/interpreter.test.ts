// Ported from Tests/CococoJinjaTests/Expression/InterpreterTests.swift

import { describe, test } from "bun:test";
import {
	evaluateExpr,
	ExpressionError,
	type ExpressionLimits,
	FilterRegistry,
	type JinjaValue,
	JV,
	makeLimits,
	parseSource,
} from "../src/index.ts";
import { expectThrowsExpressionError, expectValue, v } from "./helpers.ts";

// A representative context: { input, variables, nodes }.
const context: JinjaValue = JV.object({
	input: JV.object({
		age: JV.int(25),
		name: JV.string("Ada"),
		tags: JV.array([JV.string("a"), JV.string("b")]),
		score: JV.double(9.5),
	}),
	variables: JV.object({ threshold: JV.int(18) }),
	nodes: JV.object({
		n1: JV.object({ output: JV.object({ value: JV.int(42), ok: JV.bool(true) }) }),
		classifier: JV.object({ output: JV.object({ label: JV.string("spam") }) }),
	}),
});

function evalExpr(
	source: string,
	filters: FilterRegistry = new FilterRegistry(),
	limits: ExpressionLimits = makeLimits(),
): JinjaValue {
	return evaluateExpr(parseSource(source), context, filters, limits);
}

describe("Expression interpreter", () => {
	test("Input, variable, and node references", () => {
		expectValue(evalExpr("input.age"), v.int(25));
		expectValue(evalExpr("input.name"), v.string("Ada"));
		expectValue(evalExpr("variables.threshold"), v.int(18));
		expectValue(evalExpr("nodes.n1.output.value"), v.int(42));
		expectValue(evalExpr("nodes.classifier.output.label"), v.string("spam"));
	});

	test("Missing references resolve to null, not an error", () => {
		expectValue(evalExpr("input.missing"), v.null);
		expectValue(evalExpr("nodes.nope.output.value"), v.null);
		expectValue(evalExpr("input.age.deeper"), v.null);
		expectValue(evalExpr("totallyUnknownRoot"), v.null);
	});

	test("Index and dynamic subscripts", () => {
		expectValue(evalExpr("input.tags[0]"), v.string("a"));
		expectValue(evalExpr("input.tags[1]"), v.string("b"));
		expectValue(evalExpr("input.tags[5]"), v.null);
	});

	test("Equality uses semantic rules", () => {
		expectValue(evalExpr("input.age == 25"), v.bool(true));
		expectValue(evalExpr("input.age == 25.0"), v.bool(true));
		expectValue(evalExpr("input.age != 30"), v.bool(true));
		expectValue(evalExpr("input.name == 'Ada'"), v.bool(true));
	});

	test("Ordered comparison produces booleans", () => {
		expectValue(evalExpr("input.age >= variables.threshold"), v.bool(true));
		expectValue(evalExpr("input.age < 18"), v.bool(false));
		expectValue(evalExpr("input.score > 9"), v.bool(true));
	});

	test("Comparison of non-orderable types throws", () => {
		expectThrowsExpressionError(() => evalExpr("input.name < 5"));
	});

	test("Logical and/or return booleans and short-circuit", () => {
		expectValue(evalExpr("input.age >= 18 and input.name == 'Ada'"), v.bool(true));
		expectValue(evalExpr("input.age < 18 or input.score > 9"), v.bool(true));
		expectValue(evalExpr("input.age < 18 and 1 / 0 > 0"), v.bool(false));
		expectValue(evalExpr("not (input.age < 18)"), v.bool(true));
	});

	test("Integer arithmetic stays integer", () => {
		expectValue(evalExpr("2 + 3"), v.int(5));
		expectValue(evalExpr("10 - 4"), v.int(6));
		expectValue(evalExpr("6 * 7"), v.int(42));
		expectValue(evalExpr("7 // 2"), v.int(3));
		expectValue(evalExpr("7 % 3"), v.int(1));
	});

	test("True division always yields double", () => {
		expectValue(evalExpr("7 / 2"), v.double(3.5));
		expectValue(evalExpr("4 / 2"), v.double(2.0));
	});

	test("Mixed numeric arithmetic promotes to double", () => {
		expectValue(evalExpr("2 + 1.5"), v.double(3.5));
		expectValue(evalExpr("input.score * 2"), v.double(19.0));
	});

	test("Floor division rounds toward negative infinity", () => {
		expectValue(evalExpr("-7 // 2"), v.int(-4));
	});

	test("Division by zero throws", () => {
		expectThrowsExpressionError(() => evalExpr("1 / 0"));
		expectThrowsExpressionError(() => evalExpr("1 // 0"));
		expectThrowsExpressionError(() => evalExpr("1 % 0"));
	});

	test("Arithmetic on non-numbers throws", () => {
		expectThrowsExpressionError(() => evalExpr("'a' + 1"));
	});

	test("Concat coerces operands to strings", () => {
		expectValue(evalExpr("'Hello, ' ~ input.name"), v.string("Hello, Ada"));
		expectValue(evalExpr("'n=' ~ input.age"), v.string("n=25"));
		expectValue(evalExpr("input.age ~ '/' ~ 100"), v.string("25/100"));
	});

	test("Unary negate on numbers; error otherwise", () => {
		expectValue(evalExpr("-input.age"), v.int(-25));
		expectThrowsExpressionError(() => evalExpr("-input.name"));
	});

	test("Membership over arrays, objects, strings", () => {
		expectValue(evalExpr("'a' in input.tags"), v.bool(true));
		expectValue(evalExpr("'z' in input.tags"), v.bool(false));
		expectValue(evalExpr("'z' not in input.tags"), v.bool(true));
		expectValue(evalExpr("'age' in input"), v.bool(true));
		expectValue(evalExpr("'Ad' in input.name"), v.bool(true));
	});

	test("Membership on unsupported collection throws", () => {
		expectThrowsExpressionError(() => evalExpr("1 in input.age"));
	});

	test("Ternary chooses a branch and preserves its type", () => {
		expectValue(evalExpr("'adult' if input.age >= 18 else 'minor'"), v.string("adult"));
		expectValue(evalExpr("input.age if input.age >= 18 else 0"), v.int(25));
	});

	test("Array and object literals evaluate their elements", () => {
		expectValue(evalExpr("[1, input.age, 3]"), v.array([v.int(1), v.int(25), v.int(3)]));
		expectValue(
			evalExpr("{ id: input.age, label: input.name }"),
			v.object({ id: v.int(25), label: v.string("Ada") }),
		);
	});

	test("Filter dispatch with a registered filter", () => {
		const registry = new FilterRegistry({
			double: (input) => {
				if (input.kind !== "int") throw ExpressionError.evaluate("double expects int");
				return JV.int(input.value * 2);
			},
			suffix: (input, args) => {
				const s = input.kind === "string" ? input.value : "";
				const a = args[0]?.kind === "string" ? args[0].value : "";
				return JV.string(s + a);
			},
		});
		expectValue(evalExpr("input.age | double", registry), v.int(50));
		expectValue(evalExpr("input.name | suffix('!')", registry), v.string("Ada!"));
	});

	test("Unknown filter throws", () => {
		expectThrowsExpressionError(() => evalExpr("input.age | nope"));
	});

	test("maxOperations is enforced", () => {
		const tight = makeLimits({ maxOperations: 3 });
		expectThrowsExpressionError(() => evalExpr("1 + 2 + 3 + 4 + 5", new FilterRegistry(), tight));
	});

	test("maxDepth is enforced", () => {
		const shallow = makeLimits({ maxDepth: 1 });
		expectThrowsExpressionError(() => evalExpr("1 + 2 * 3", new FilterRegistry(), shallow));
	});

	test("maxCollectionSize is enforced", () => {
		const tiny = makeLimits({ maxCollectionSize: 2 });
		expectThrowsExpressionError(() => evalExpr("[1, 2, 3]", new FilterRegistry(), tiny));
	});

	test("maxStringLength is enforced for concat", () => {
		const tiny = makeLimits({ maxStringLength: 3 });
		expectThrowsExpressionError(() => evalExpr("'ab' ~ 'cd'", new FilterRegistry(), tiny));
	});
});
