// Ported from Tests/CococoJinjaTests/Expression/LexerTests.swift

import { describe, expect, test } from "bun:test";
import type { TokenKind } from "../src/ast.ts";
import { ExpressionError, tokenize } from "../src/index.ts";
import { expectThrowsExpressionError, tokenKindsEqual } from "./helpers.ts";

// Tokenize and return the kinds, dropping the trailing eof.
function kinds(source: string): TokenKind[] {
	const tokens = tokenize(source);
	expect(tokens[tokens.length - 1]!.kind.t).toBe("eof");
	return tokens.slice(0, -1).map((t) => t.kind);
}

function expectKinds(source: string, expected: TokenKind[]): void {
	expect(tokenKindsEqual(kinds(source), expected)).toBe(true);
}

describe("Expression lexer", () => {
	// Numbers
	test("Integer literals", () => {
		expectKinds("0", [{ t: "int", value: 0 }]);
		expectKinds("42", [{ t: "int", value: 42 }]);
		expectKinds("1000000", [{ t: "int", value: 1_000_000 }]);
	});

	test("Double literals: fraction and exponent", () => {
		expectKinds("3.14", [{ t: "double", value: 3.14 }]);
		expectKinds("1.0", [{ t: "double", value: 1.0 }]);
		expectKinds("1e3", [{ t: "double", value: 1000 }]);
		expectKinds("2.5e-2", [{ t: "double", value: 0.025 }]);
		expectKinds("6E2", [{ t: "double", value: 600 }]);
	});

	test("Integer overflow falls back to double", () => {
		const toks = kinds("99999999999999999999");
		expect(toks[0]!.t).toBe("double");
	});

	test("Dot after number is member access, not a fraction without trailing digit", () => {
		expectKinds("1.foo", [
			{ t: "int", value: 1 },
			{ t: "dot" },
			{ t: "identifier", value: "foo" },
		]);
		expectKinds("1.5", [{ t: "double", value: 1.5 }]);
	});

	test("Malformed exponent throws", () => {
		expectThrowsExpressionError(() => tokenize("1e"));
		expectThrowsExpressionError(() => tokenize("1e+"));
	});

	// Strings
	test("String literals with both quote styles", () => {
		expectKinds("'hello'", [{ t: "string", value: "hello" }]);
		expectKinds('"world"', [{ t: "string", value: "world" }]);
		expectKinds("''", [{ t: "string", value: "" }]);
	});

	test("String escapes", () => {
		expectKinds("'a\\nb'", [{ t: "string", value: "a\nb" }]);
		expectKinds("'tab\\tend'", [{ t: "string", value: "tab\tend" }]);
		expectKinds("'quote\\'s'", [{ t: "string", value: "quote's" }]);
		expectKinds('"back\\\\slash"', [{ t: "string", value: "back\\slash" }]);
	});

	test("Unterminated string throws", () => {
		expectThrowsExpressionError(() => tokenize("'oops"));
	});

	test("Invalid escape throws", () => {
		expectThrowsExpressionError(() => tokenize("'\\q'"));
	});

	// Keywords & identifiers
	test("Keywords", () => {
		expectKinds("true false null none", [
			{ t: "kwTrue" },
			{ t: "kwFalse" },
			{ t: "kwNull" },
			{ t: "kwNull" },
		]);
		expectKinds("and or not in if else", [
			{ t: "kwAnd" },
			{ t: "kwOr" },
			{ t: "kwNot" },
			{ t: "kwIn" },
			{ t: "kwIf" },
			{ t: "kwElse" },
		]);
	});

	test("Identifiers, including ones that contain keyword substrings", () => {
		expectKinds("input", [{ t: "identifier", value: "input" }]);
		expectKinds("_private", [{ t: "identifier", value: "_private" }]);
		expectKinds("node1", [{ t: "identifier", value: "node1" }]);
		expectKinds("android", [{ t: "identifier", value: "android" }]);
		expectKinds("information", [{ t: "identifier", value: "information" }]);
	});

	// Operators & punctuation
	test("Multi-character operators", () => {
		expectKinds("== != <= >= //", [
			{ t: "eq" },
			{ t: "neq" },
			{ t: "lte" },
			{ t: "gte" },
			{ t: "slashSlash" },
		]);
	});

	test("Single-character operators and punctuation", () => {
		expectKinds("< > + - * / % ~", [
			{ t: "lt" },
			{ t: "gt" },
			{ t: "plus" },
			{ t: "minus" },
			{ t: "star" },
			{ t: "slash" },
			{ t: "percent" },
			{ t: "tilde" },
		]);
		expectKinds("( ) [ ] { } , : . |", [
			{ t: "lparen" },
			{ t: "rparen" },
			{ t: "lbracket" },
			{ t: "rbracket" },
			{ t: "lbrace" },
			{ t: "rbrace" },
			{ t: "comma" },
			{ t: "colon" },
			{ t: "dot" },
			{ t: "pipe" },
		]);
	});

	test("Lone = and lone ! throw", () => {
		expectThrowsExpressionError(() => tokenize("a = b"));
		expectThrowsExpressionError(() => tokenize("!a"));
	});

	test("Unexpected character throws", () => {
		expectThrowsExpressionError(() => tokenize("a @ b"));
	});

	// Whitespace & offsets
	test("Whitespace is skipped", () => {
		expectKinds("  a\t+\n b ", [
			{ t: "identifier", value: "a" },
			{ t: "plus" },
			{ t: "identifier", value: "b" },
		]);
		expectKinds("", []);
	});

	test("Token offsets point at the token start", () => {
		const tokens = tokenize("a + 42");
		expect(tokens[0]!.offset).toBe(0);
		expect(tokens[1]!.offset).toBe(2);
		expect(tokens[2]!.offset).toBe(4);
	});

	test("Error offset points at the offending character", () => {
		let err: unknown;
		try {
			tokenize("ok @");
		} catch (e) {
			err = e;
		}
		expect(err).toBeInstanceOf(ExpressionError);
		expect((err as ExpressionError).phase).toBe("lex");
		expect((err as ExpressionError).offset).toBe(3);
	});

	test("A full expression tokenizes", () => {
		expectKinds("input.age >= 18 and user.role == 'admin'", [
			{ t: "identifier", value: "input" },
			{ t: "dot" },
			{ t: "identifier", value: "age" },
			{ t: "gte" },
			{ t: "int", value: 18 },
			{ t: "kwAnd" },
			{ t: "identifier", value: "user" },
			{ t: "dot" },
			{ t: "identifier", value: "role" },
			{ t: "eq" },
			{ t: "string", value: "admin" },
		]);
	});
});
