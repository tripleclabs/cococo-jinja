// Ported from Tests/CococoJinjaTests/Expression/PrinterRoundTripTests.swift

import { describe, expect, test } from "bun:test";
import type { Expr } from "../src/ast.ts";
import { JV, parseSource, printExpr } from "../src/index.ts";
import { exprEqual, key, lit, ref, v } from "./helpers.ts";

const corpus: string[] = [
	// literals
	"42",
	"-5",
	"3.14",
	"-2.5",
	"'hello'",
	"true",
	"false",
	"null",
	// references
	"input",
	"input.age",
	"nodes.n1.output.value",
	"items[0]",
	"a.b[2].c",
	"items[input.idx]",
	'a["b-c"]',
	// arithmetic & precedence
	"1 + 2 * 3",
	"1 - 2 - 3",
	"(1 + 2) * 3",
	"a / b // c % d",
	"a + 1 > b",
	"a ~ b == c",
	// comparison & logic
	"input.age >= 18",
	"x == null",
	"a != b",
	"a and b and c",
	"a or b or c",
	"a or b and c",
	"(a or b) and c",
	"not a",
	"not a == b",
	"not (a and b)",
	// membership
	"x in items",
	"x not in items",
	// ternary
	"'yes' if cond else 'no'",
	"a if c1 else b if c2 else d",
	// filters
	"items | length",
	"value | default('n/a')",
	"a | f | g",
	"(a + b) | f",
	"items | join(', ')",
	// collections
	"[1, 2, 3]",
	"[]",
	"{a: 1, b: 2}",
	"{}",
	"{total: a + b}",
	// mixed/realistic
	"input.age >= 18 and user.role == 'admin'",
	"(items | length) > 0 and not done",
	"status if status != null else 'pending'",
];

describe("Expression printer & round-trip", () => {
	test("parse(print(ast)) ≡ ast for the whole corpus", () => {
		for (const source of corpus) {
			const ast1 = parseSource(source);
			const printed = printExpr(ast1);
			const ast2 = parseSource(printed);
			expect(exprEqual(ast1, ast2)).toBe(true);
		}
	});

	test("print(parse(text)) is idempotent for the whole corpus", () => {
		for (const source of corpus) {
			const once = printExpr(parseSource(source));
			const twice = printExpr(parseSource(once));
			expect(once).toBe(twice);
		}
	});

	test("Whitespace is normalized canonically", () => {
		expect(printExpr(parseSource("1+2*3"))).toBe("1 + 2 * 3");
		expect(printExpr(parseSource("a   and    b"))).toBe("a and b");
		expect(printExpr(parseSource("input.age>=18"))).toBe("input.age >= 18");
	});

	test("Redundant parentheses are dropped", () => {
		expect(printExpr(parseSource("((1 + 2))"))).toBe("1 + 2");
		expect(printExpr(parseSource("(a)"))).toBe("a");
	});

	test("Necessary parentheses are kept", () => {
		expect(printExpr(parseSource("(1 + 2) * 3"))).toBe("(1 + 2) * 3");
		expect(printExpr(parseSource("(a or b) and c"))).toBe("(a or b) and c");
		expect(printExpr(parseSource("1 - (2 - 3)"))).toBe("1 - (2 - 3)");
	});

	test("Keyword and non-identifier member keys print as bracketed strings", () => {
		const ast: Expr = ref(key("x"), key("and"));
		expect(printExpr(ast)).toBe("x['and']");
		expect(exprEqual(parseSource(printExpr(ast)), ast)).toBe(true);

		const hyphen: Expr = ref(key("a"), key("b-c"));
		expect(printExpr(hyphen)).toBe("a['b-c']");
		expect(exprEqual(parseSource(printExpr(hyphen)), hyphen)).toBe(true);
	});

	test("Keyword object keys are quoted", () => {
		const ast: Expr = { e: "objectLiteral", entries: [{ key: "if", value: lit(v.int(1)) }] };
		expect(printExpr(ast)).toBe("{'if': 1}");
		expect(exprEqual(parseSource(printExpr(ast)), ast)).toBe(true);
	});

	test("String escaping round-trips", () => {
		for (const raw of ["a\nb", "tab\there", "it's", "back\\slash", 'quote"x']) {
			const ast: Expr = lit(JV.string(raw));
			const printed = printExpr(ast);
			expect(exprEqual(parseSource(printed), ast)).toBe(true);
		}
	});

	test("Integral doubles keep their .0 and round-trip", () => {
		const ast: Expr = lit(v.double(1.0));
		expect(printExpr(ast)).toBe("1.0");
		expect(exprEqual(parseSource("1.0"), ast)).toBe(true);
	});
});
