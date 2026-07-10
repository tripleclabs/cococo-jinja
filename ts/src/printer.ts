// printer.ts — port of Expression/Printer.swift
//
// Canonical AST -> string projection. Deterministic, minimally parenthesized.
//   - parse(print(ast)) ≡ ast
//   - print(parse(text)) is idempotent

import type { BinaryOperator, Expr, PathSegment } from "./ast.ts";
import { type JinjaValue, renderDouble, renderedString } from "./value.ts";

// Precedence ladder (higher binds tighter). Mirrors the parser.
const Prec = {
	ternary: 1,
	or: 2,
	and: 3,
	not: 4,
	comparison: 5,
	concat: 6,
	additive: 7,
	multiplicative: 8,
	negate: 9,
	filter: 10,
	reference: 11,
	primary: 12,
} as const;

function precedenceOf(op: BinaryOperator): number {
	switch (op) {
		case "==":
		case "!=":
		case "<":
		case "<=":
		case ">":
		case ">=":
		case "in":
		case "not in":
			return Prec.comparison;
		case "~":
			return Prec.concat;
		case "+":
		case "-":
			return Prec.additive;
		case "*":
		case "/":
		case "//":
		case "%":
			return Prec.multiplicative;
	}
}

/** Render an expression to its canonical source form. */
export function printExpr(expr: Expr): string {
	return emit(expr, 0);
}

function emit(expr: Expr, minContext: number): string {
	const [text, prec] = render(expr);
	return prec < minContext ? `(${text})` : text;
}

function render(expr: Expr): [string, number] {
	switch (expr.e) {
		case "literal":
			return [renderLiteral(expr.value), Prec.primary];
		case "reference":
			return [renderReference(expr.segments), Prec.reference];
		case "unary":
			if (expr.op === "not") {
				return [`not ${emit(expr.operand, Prec.not)}`, Prec.not];
			}
			return [`-${emit(expr.operand, Prec.negate)}`, Prec.negate];
		case "binary": {
			const p = precedenceOf(expr.op);
			const left = emit(expr.lhs, p);
			const right = emit(expr.rhs, p + 1);
			return [`${left} ${expr.op} ${right}`, p];
		}
		case "logical": {
			const p = expr.op === "or" ? Prec.or : Prec.and;
			const keyword = expr.op === "or" ? "or" : "and";
			const parts = expr.operands.map((o) => emit(o, p + 1));
			return [parts.join(` ${keyword} `), p];
		}
		case "conditional": {
			const thenText = emit(expr.then, Prec.or);
			const condText = emit(expr.condition, Prec.or);
			const elseText = emit(expr.otherwise, Prec.ternary);
			return [`${thenText} if ${condText} else ${elseText}`, Prec.ternary];
		}
		case "filter": {
			const inputText = emit(expr.input, Prec.filter);
			if (expr.arguments.length === 0) {
				return [`${inputText} | ${expr.name}`, Prec.filter];
			}
			const argText = expr.arguments.map((a) => emit(a, 0)).join(", ");
			return [`${inputText} | ${expr.name}(${argText})`, Prec.filter];
		}
		case "arrayLiteral": {
			const parts = expr.elements.map((el) => emit(el, 0));
			return [`[${parts.join(", ")}]`, Prec.primary];
		}
		case "objectLiteral": {
			const parts = expr.entries.map((en) => `${renderKey(en.key)}: ${emit(en.value, 0)}`);
			return [`{${parts.join(", ")}}`, Prec.primary];
		}
	}
}

// MARK: - Leaves

function renderLiteral(value: JinjaValue): string {
	switch (value.kind) {
		case "null":
			return "null";
		case "bool":
			return value.value ? "true" : "false";
		case "int":
			return String(value.value);
		case "double":
			return renderDouble(value.value);
		case "string":
			return renderStringLiteral(value.value);
		case "date":
			// No source syntax for dates; best-effort quoted ISO string.
			return renderStringLiteral(renderedString(value));
		case "array": {
			const parts = value.value.map(renderLiteral);
			return `[${parts.join(", ")}]`;
		}
		case "object": {
			// Sort by key so a literal object prints canonically.
			const parts = [...value.value.entries()]
				.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
				.map(([k, v]) => `${renderKey(k)}: ${renderLiteral(v)}`);
			return `{${parts.join(", ")}}`;
		}
	}
}

function renderStringLiteral(s: string): string {
	let out = "'";
	for (const ch of s) {
		switch (ch) {
			case "\\":
				out += "\\\\";
				break;
			case "'":
				out += "\\'";
				break;
			case "\n":
				out += "\\n";
				break;
			case "\t":
				out += "\\t";
				break;
			case "\r":
				out += "\\r";
				break;
			default:
				out += ch;
		}
	}
	out += "'";
	return out;
}

function renderReference(segments: PathSegment[]): string {
	let out = "";
	segments.forEach((segment, i) => {
		switch (segment.s) {
			case "key":
				if (i === 0) {
					out += segment.name;
				} else if (isIdentifier(segment.name)) {
					out += `.${segment.name}`;
				} else {
					out += `[${renderStringLiteral(segment.name)}]`;
				}
				break;
			case "index":
				out += `[${segment.index}]`;
				break;
			case "dynamic":
				out += `[${emit(segment.expr, 0)}]`;
				break;
		}
	});
	return out;
}

function renderKey(key: string): string {
	return isIdentifier(key) ? key : renderStringLiteral(key);
}

const KEYWORDS = new Set([
	"true",
	"false",
	"null",
	"none",
	"and",
	"or",
	"not",
	"in",
	"if",
	"else",
]);

function isIdentifier(s: string): boolean {
	const chars = Array.from(s);
	const first = chars[0];
	if (first === undefined || !(/\p{L}/u.test(first) || first === "_")) return false;
	for (let i = 1; i < chars.length; i++) {
		const ch = chars[i]!;
		if (!(/\p{L}/u.test(ch) || /\p{Nd}/u.test(ch) || ch === "_")) return false;
	}
	return !KEYWORDS.has(s);
}
