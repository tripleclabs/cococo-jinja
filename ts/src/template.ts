// template.ts — port of Expression/ExpressionTemplate.swift
//
// The dialect's front door. Splits a source string into plaintext and `{{ }}`
// spans, then applies the smart-evaluation contract (§6):
//   - a source that is a single `{{ expr }}` span (modulo whitespace) → typed value
//   - anything else → string

import type { Expr } from "./ast.ts";
import { ExpressionError } from "./errors.ts";
import { FilterRegistry } from "./filters.ts";
import { evaluateExpr } from "./interpreter.ts";
import { type ExpressionLimits, standardLimits } from "./limits.ts";
import { parseSource } from "./parser.ts";
import { type JinjaValue, JV, renderedString } from "./value.ts";

export type Segment = { s: "text"; text: string } | { s: "expression"; expr: Expr };

/** Smart evaluation: typed value for a single expression span, else a string. */
export function templateEvaluate(
	source: string,
	context: JinjaValue,
	filters: FilterRegistry = FilterRegistry.standard,
	limits: ExpressionLimits = standardLimits,
): JinjaValue {
	const segments = scan(source);
	const sole = soleExpression(segments);
	if (sole !== undefined) {
		return evaluateExpr(sole, context, filters, limits);
	}
	return JV.string(renderSegments(segments, context, filters, limits));
}

/** Always render to a string (the explicit text projection). */
export function templateRender(
	source: string,
	context: JinjaValue,
	filters: FilterRegistry = FilterRegistry.standard,
	limits: ExpressionLimits = standardLimits,
): string {
	return renderSegments(scan(source), context, filters, limits);
}

/**
 * The parsed expression if `source` is a single `{{ expr }}` span (modulo
 * surrounding whitespace); `undefined` for plaintext / mixed / multi-span.
 */
export function singleExpression(source: string): Expr | undefined {
	return soleExpression(scan(source));
}

// MARK: - Segments

function soleExpression(segments: Segment[]): Expr | undefined {
	let found: Expr | undefined;
	for (const segment of segments) {
		if (segment.s === "text") {
			if (!isAllWhitespace(segment.text)) return undefined;
		} else {
			if (found !== undefined) return undefined; // more than one expression
			found = segment.expr;
		}
	}
	return found;
}

function renderSegments(
	segments: Segment[],
	context: JinjaValue,
	filters: FilterRegistry,
	limits: ExpressionLimits,
): string {
	let out = "";
	for (const segment of segments) {
		if (segment.s === "text") {
			out += segment.text;
		} else {
			out += renderedString(evaluateExpr(segment.expr, context, filters, limits));
		}
		if (charCount(out) > limits.maxStringLength) {
			throw ExpressionError.evaluate(
				`rendered output exceeds limit (${limits.maxStringLength})`,
			);
		}
	}
	return out;
}

// MARK: - Scanner (text vs `{{ }}` spans)

export function scan(source: string): Segment[] {
	const chars = Array.from(source);
	const segments: Segment[] = [];
	let textStart = 0;
	let i = 0;

	const flushText = (end: number) => {
		if (end > textStart) {
			segments.push({ s: "text", text: chars.slice(textStart, end).join("") });
		}
	};

	while (i < chars.length) {
		if (chars[i] === "{" && i + 1 < chars.length && chars[i + 1] === "{") {
			const openAt = i;
			flushText(openAt);
			// Find the closing `}}`, skipping `}}` inside quoted string literals.
			let j = i + 2;
			let quote: string | undefined;
			while (j < chars.length) {
				const c = chars[j]!;
				if (quote !== undefined) {
					if (c === "\\") {
						j += 2; // skip escaped char
						continue;
					}
					if (c === quote) quote = undefined;
					j += 1;
				} else if (c === "'" || c === '"') {
					quote = c;
					j += 1;
				} else if (c === "}" && j + 1 < chars.length && chars[j + 1] === "}") {
					break;
				} else {
					j += 1;
				}
			}
			if (!(j + 1 < chars.length && chars[j] === "}" && chars[j + 1] === "}")) {
				throw ExpressionError.parse("unterminated '{{' expression span", openAt);
			}
			const exprSource = chars.slice(openAt + 2, j).join("");
			const expr = parseSpan(exprSource, openAt + 2);
			segments.push({ s: "expression", expr });
			i = j + 2;
			textStart = i;
		} else {
			i += 1;
		}
	}
	flushText(chars.length);
	return segments;
}

/** Parse one expression span, rebasing any error offset onto the full source. */
function parseSpan(exprSource: string, baseOffset: number): Expr {
	try {
		return parseSource(exprSource);
	} catch (error) {
		if (error instanceof ExpressionError) {
			throw new ExpressionError(
				error.phase,
				error.rawMessage,
				error.offset === undefined ? undefined : error.offset + baseOffset,
			);
		}
		throw error;
	}
}

function isAllWhitespace(s: string): boolean {
	// Swift's Character.isWhitespace covers Unicode whitespace incl. line breaks.
	return /^\s*$/u.test(s);
}

function charCount(s: string): number {
	return Array.from(s).length;
}
