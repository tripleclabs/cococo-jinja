// ast.ts — port of Expression/ExpressionAST.swift and Expression/Token.swift
//
// The expression AST is the single source of truth for the dialect. Tokens are
// here too (small enough not to warrant a separate module in TS).

import type { JinjaValue } from "./value.ts";

// MARK: - Tokens

export type TokenKind =
	// Literals
	| { t: "int"; value: number }
	| { t: "double"; value: number }
	| { t: "string"; value: string }
	// Identifiers & keywords
	| { t: "identifier"; value: string }
	| { t: "kwTrue" }
	| { t: "kwFalse" }
	| { t: "kwNull" } // `null` and `none` both lex to this
	| { t: "kwAnd" }
	| { t: "kwOr" }
	| { t: "kwNot" }
	| { t: "kwIn" }
	| { t: "kwIf" }
	| { t: "kwElse" }
	// Grouping / punctuation
	| { t: "lparen" }
	| { t: "rparen" }
	| { t: "lbracket" }
	| { t: "rbracket" }
	| { t: "lbrace" }
	| { t: "rbrace" }
	| { t: "comma" }
	| { t: "colon" }
	| { t: "dot" }
	| { t: "pipe" }
	// Operators
	| { t: "eq" }
	| { t: "neq" }
	| { t: "lt" }
	| { t: "lte" }
	| { t: "gt" }
	| { t: "gte" }
	| { t: "plus" }
	| { t: "minus" }
	| { t: "star" }
	| { t: "slash" }
	| { t: "slashSlash" }
	| { t: "percent" }
	| { t: "tilde" }
	| { t: "eof" };

export interface Token {
	readonly kind: TokenKind;
	/** Character offset of the token's first character in the source. */
	readonly offset: number;
}

/** Structural equality of two token kinds (for parser lookahead / tests). */
export function tokenKindEquals(a: TokenKind, b: TokenKind): boolean {
	if (a.t !== b.t) return false;
	switch (a.t) {
		case "int":
		case "double":
			return a.value === (b as { value: number }).value;
		case "string":
		case "identifier":
			return a.value === (b as { value: string }).value;
		default:
			return true;
	}
}

/** Human-readable description for parser error messages (mirrors Swift). */
export function tokenDescription(k: TokenKind): string {
	switch (k.t) {
		case "int":
			return `integer ${k.value}`;
		case "double":
			return `number ${describeDouble(k.value)}`;
		case "string":
			return `string "${k.value}"`;
		case "identifier":
			return `identifier '${k.value}'`;
		case "kwTrue":
			return "'true'";
		case "kwFalse":
			return "'false'";
		case "kwNull":
			return "'null'";
		case "kwAnd":
			return "'and'";
		case "kwOr":
			return "'or'";
		case "kwNot":
			return "'not'";
		case "kwIn":
			return "'in'";
		case "kwIf":
			return "'if'";
		case "kwElse":
			return "'else'";
		case "lparen":
			return "'('";
		case "rparen":
			return "')'";
		case "lbracket":
			return "'['";
		case "rbracket":
			return "']'";
		case "lbrace":
			return "'{'";
		case "rbrace":
			return "'}'";
		case "comma":
			return "','";
		case "colon":
			return "':'";
		case "dot":
			return "'.'";
		case "pipe":
			return "'|'";
		case "eq":
			return "'=='";
		case "neq":
			return "'!='";
		case "lt":
			return "'<'";
		case "lte":
			return "'<='";
		case "gt":
			return "'>'";
		case "gte":
			return "'>='";
		case "plus":
			return "'+'";
		case "minus":
			return "'-'";
		case "star":
			return "'*'";
		case "slash":
			return "'/'";
		case "slashSlash":
			return "'//'";
		case "percent":
			return "'%'";
		case "tilde":
			return "'~'";
		case "eof":
			return "end of input";
	}
}

// Swift `String(v)` for a Double inside a token description — reuse the same
// integral `.0` rule.
function describeDouble(d: number): string {
	let s = String(d);
	if (!s.includes(".") && !s.includes("e") && !s.includes("E")) s += ".0";
	return s;
}

// MARK: - Operators

export type UnaryOperator = "not" | "negate";
export type LogicalOperator = "and" | "or";

export type BinaryOperator =
	| "==" // eq
	| "!=" // neq
	| "<" // lt
	| "<=" // lte
	| ">" // gt
	| ">=" // gte
	| "+" // add
	| "-" // subtract
	| "*" // multiply
	| "/" // divide
	| "//" // floorDivide
	| "%" // modulo
	| "~" // concat
	| "in" // contains
	| "not in"; // notContains

// MARK: - AST

export type PathSegment =
	| { s: "key"; name: string }
	| { s: "index"; index: number }
	| { s: "dynamic"; expr: Expr };

export interface ObjectEntry {
	readonly key: string;
	readonly value: Expr;
}

export type Expr =
	| { e: "literal"; value: JinjaValue }
	| { e: "reference"; segments: PathSegment[] }
	| { e: "unary"; op: UnaryOperator; operand: Expr }
	| { e: "binary"; op: BinaryOperator; lhs: Expr; rhs: Expr }
	| { e: "logical"; op: LogicalOperator; operands: Expr[] }
	| { e: "conditional"; condition: Expr; then: Expr; otherwise: Expr }
	| { e: "filter"; name: string; input: Expr; arguments: Expr[] }
	| { e: "arrayLiteral"; elements: Expr[] }
	| { e: "objectLiteral"; entries: ObjectEntry[] };
