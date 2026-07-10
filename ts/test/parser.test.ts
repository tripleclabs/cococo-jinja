// Ported from Tests/CococoJinjaTests/Expression/ParserTests.swift

import { describe, test } from "bun:test";
import type { Expr } from "../src/ast.ts";
import { parseSource } from "../src/index.ts";
import { expectExpr, expectThrowsExpressionError, key, lit, ref, v } from "./helpers.ts";

const parse = (source: string): Expr => parseSource(source);

describe("Expression parser", () => {
	// Literals
	test("Scalar literals", () => {
		expectExpr(parse("42"), lit(v.int(42)));
		expectExpr(parse("3.14"), lit(v.double(3.14)));
		expectExpr(parse("'hi'"), lit(v.string("hi")));
		expectExpr(parse("true"), lit(v.bool(true)));
		expectExpr(parse("false"), lit(v.bool(false)));
		expectExpr(parse("null"), lit(v.null));
		expectExpr(parse("none"), lit(v.null));
	});

	test("Negative numeric literals are constant-folded to bare literals", () => {
		expectExpr(parse("-5"), lit(v.int(-5)));
		expectExpr(parse("-2.5"), lit(v.double(-2.5)));
		expectExpr(parse("-x"), { e: "unary", op: "negate", operand: ref(key("x")) });
	});

	test("Unary plus is a no-op", () => {
		expectExpr(parse("+5"), lit(v.int(5)));
	});

	// References
	test("Member access builds a reference path", () => {
		expectExpr(parse("input"), ref(key("input")));
		expectExpr(parse("input.age"), ref(key("input"), key("age")));
		expectExpr(
			parse("nodes.n1.output.value"),
			ref(key("nodes"), key("n1"), key("output"), key("value")),
		);
	});

	test("Index and string-key subscripts", () => {
		expectExpr(parse("items[0]"), ref(key("items"), { s: "index", index: 0 }));
		expectExpr(parse('a["b-c"]'), ref(key("a"), key("b-c")));
		expectExpr(
			parse("a.b[2].c"),
			ref(key("a"), key("b"), { s: "index", index: 2 }, key("c")),
		);
	});

	test("Dynamic subscript holds an expression", () => {
		expectExpr(
			parse("items[input.idx]"),
			ref(key("items"), { s: "dynamic", expr: ref(key("input"), key("idx")) }),
		);
	});

	// Operator precedence
	test("Arithmetic precedence: * binds tighter than +", () => {
		expectExpr(parse("1 + 2 * 3"), {
			e: "binary",
			op: "+",
			lhs: lit(v.int(1)),
			rhs: { e: "binary", op: "*", lhs: lit(v.int(2)), rhs: lit(v.int(3)) },
		});
	});

	test("Additive is left-associative", () => {
		expectExpr(parse("1 - 2 - 3"), {
			e: "binary",
			op: "-",
			lhs: { e: "binary", op: "-", lhs: lit(v.int(1)), rhs: lit(v.int(2)) },
			rhs: lit(v.int(3)),
		});
	});

	test("Comparison binds looser than arithmetic", () => {
		expectExpr(parse("a + 1 > b"), {
			e: "binary",
			op: ">",
			lhs: { e: "binary", op: "+", lhs: ref(key("a")), rhs: lit(v.int(1)) },
			rhs: ref(key("b")),
		});
	});

	test("not binds looser than comparison", () => {
		expectExpr(parse("not a == b"), {
			e: "unary",
			op: "not",
			operand: { e: "binary", op: "==", lhs: ref(key("a")), rhs: ref(key("b")) },
		});
	});

	test("and binds tighter than or", () => {
		expectExpr(parse("a or b and c"), {
			e: "logical",
			op: "or",
			operands: [
				ref(key("a")),
				{ e: "logical", op: "and", operands: [ref(key("b")), ref(key("c"))] },
			],
		});
	});

	test("Logical operators are n-ary and flat", () => {
		expectExpr(parse("a and b and c"), {
			e: "logical",
			op: "and",
			operands: [ref(key("a")), ref(key("b")), ref(key("c"))],
		});
		expectExpr(parse("a or b or c or d"), {
			e: "logical",
			op: "or",
			operands: [ref(key("a")), ref(key("b")), ref(key("c")), ref(key("d"))],
		});
	});

	test("Concat ~ binds looser than arithmetic, tighter than comparison", () => {
		expectExpr(parse("a ~ b == c"), {
			e: "binary",
			op: "==",
			lhs: { e: "binary", op: "~", lhs: ref(key("a")), rhs: ref(key("b")) },
			rhs: ref(key("c")),
		});
	});

	test("Grouping overrides precedence", () => {
		expectExpr(parse("(1 + 2) * 3"), {
			e: "binary",
			op: "*",
			lhs: { e: "binary", op: "+", lhs: lit(v.int(1)), rhs: lit(v.int(2)) },
			rhs: lit(v.int(3)),
		});
	});

	// Membership
	test("in and not in", () => {
		expectExpr(parse("x in items"), {
			e: "binary",
			op: "in",
			lhs: ref(key("x")),
			rhs: ref(key("items")),
		});
		expectExpr(parse("x not in items"), {
			e: "binary",
			op: "not in",
			lhs: ref(key("x")),
			rhs: ref(key("items")),
		});
	});

	// Ternary
	test("Ternary parses with Jinja value-first order", () => {
		expectExpr(parse("'yes' if cond else 'no'"), {
			e: "conditional",
			condition: ref(key("cond")),
			then: lit(v.string("yes")),
			otherwise: lit(v.string("no")),
		});
	});

	test("Ternary is right-associative (chains)", () => {
		expectExpr(parse("a if c1 else b if c2 else d"), {
			e: "conditional",
			condition: ref(key("c1")),
			then: ref(key("a")),
			otherwise: {
				e: "conditional",
				condition: ref(key("c2")),
				then: ref(key("b")),
				otherwise: ref(key("d")),
			},
		});
	});

	// Filters
	test("Filter without arguments", () => {
		expectExpr(parse("items | length"), {
			e: "filter",
			name: "length",
			input: ref(key("items")),
			arguments: [],
		});
	});

	test("Filter with arguments", () => {
		expectExpr(parse("value | default('n/a')"), {
			e: "filter",
			name: "default",
			input: ref(key("value")),
			arguments: [lit(v.string("n/a"))],
		});
	});

	test("Filter chains are left-associative", () => {
		expectExpr(parse("a | f | g"), {
			e: "filter",
			name: "g",
			input: { e: "filter", name: "f", input: ref(key("a")), arguments: [] },
			arguments: [],
		});
	});

	test("Filter binds tighter than arithmetic", () => {
		expectExpr(parse("a | f + b"), {
			e: "binary",
			op: "+",
			lhs: { e: "filter", name: "f", input: ref(key("a")), arguments: [] },
			rhs: ref(key("b")),
		});
	});

	// Collection literals
	test("Array literal", () => {
		expectExpr(parse("[1, 2, 3]"), {
			e: "arrayLiteral",
			elements: [lit(v.int(1)), lit(v.int(2)), lit(v.int(3))],
		});
		expectExpr(parse("[]"), { e: "arrayLiteral", elements: [] });
	});

	test("Array literal with trailing comma", () => {
		expectExpr(parse("[1, 2,]"), {
			e: "arrayLiteral",
			elements: [lit(v.int(1)), lit(v.int(2))],
		});
	});

	test("Object literal with string and identifier keys", () => {
		expectExpr(parse('{ "a": 1, b: 2 }'), {
			e: "objectLiteral",
			entries: [
				{ key: "a", value: lit(v.int(1)) },
				{ key: "b", value: lit(v.int(2)) },
			],
		});
		expectExpr(parse("{}"), { e: "objectLiteral", entries: [] });
	});

	test("Object literal with expression values and trailing comma", () => {
		expectExpr(parse("{ total: a + b, }"), {
			e: "objectLiteral",
			entries: [
				{
					key: "total",
					value: { e: "binary", op: "+", lhs: ref(key("a")), rhs: ref(key("b")) },
				},
			],
		});
	});

	// Error cases
	test("Trailing tokens after a complete expression throw", () => {
		expectThrowsExpressionError(() => parse("1 2"));
		expectThrowsExpressionError(() => parse("a b"));
	});

	test("Unclosed grouping/brackets throw", () => {
		expectThrowsExpressionError(() => parse("(1 + 2"));
		expectThrowsExpressionError(() => parse("[1, 2"));
		expectThrowsExpressionError(() => parse("{ a: 1"));
	});

	test("Missing filter name throws", () => {
		expectThrowsExpressionError(() => parse("a | 5"));
		expectThrowsExpressionError(() => parse("a |"));
	});

	test("Bad member access throws", () => {
		expectThrowsExpressionError(() => parse("a."));
		expectThrowsExpressionError(() => parse("a.1"));
	});

	test("Dangling 'not' without 'in' at membership position throws", () => {
		expectThrowsExpressionError(() => parse("a not b"));
	});

	test("Empty input throws", () => {
		expectThrowsExpressionError(() => parse(""));
		expectThrowsExpressionError(() => parse("   "));
	});
});
