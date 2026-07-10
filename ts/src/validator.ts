// validator.ts — port of Expression/ExpressionValidator.swift
//
// Static (parse-time) validation for editor feedback. Pure and stateless:
// returns line/column diagnostics — no evaluation, no context, no I/O.

import type { Expr } from "./ast.ts";
import { ExpressionError } from "./errors.ts";
import { FilterRegistry } from "./filters.ts";
import { parseSource } from "./parser.ts";
import { scan, singleExpression } from "./template.ts";

export type ExpressionFormat = "PREDICATE" | "TEMPLATE";
export type ExpressionDiagnosticSeverity = "ERROR" | "WARNING";

export interface ExpressionDiagnostic {
	line: number;
	column: number;
	/** 0-based character offset into the source, or -1 when unavailable. */
	offset: number;
	severity: ExpressionDiagnosticSeverity;
	message: string;
	/** The phase that produced it: lex, parse, evaluate, or filter. */
	phase: string;
}

export interface ExpressionValidationResult {
	success: boolean;
	diagnostics: ExpressionDiagnostic[];
}

/** Validate a workflow-expression source without evaluating it. */
export function validate(
	source: string,
	format: ExpressionFormat,
	filters: FilterRegistry = FilterRegistry.standard,
): ExpressionValidationResult {
	// 1. Parse.
	let expressions: Expr[];
	try {
		if (format === "PREDICATE") {
			const expr = singleExpression(source);
			if (expr !== undefined) {
				expressions = [expr];
			} else {
				expressions = [parseSource(source)];
			}
		} else {
			expressions = scan(source)
				.filter((seg): seg is { s: "expression"; expr: Expr } => seg.s === "expression")
				.map((seg) => seg.expr);
		}
	} catch (error) {
		if (error instanceof ExpressionError) {
			return { success: false, diagnostics: [diagnosticFromError(error, source)] };
		}
		return {
			success: false,
			diagnostics: [
				{
					line: 0,
					column: 0,
					offset: -1,
					severity: "ERROR",
					message: String(error),
					phase: "parse",
				},
			],
		};
	}

	// 2. Static filter-name check.
	const known = filters.names;
	const unknown: string[] = [];
	for (const expression of expressions) {
		for (const name of filterNames(expression)) {
			if (!known.has(name) && !unknown.includes(name)) unknown.push(name);
		}
	}
	const diagnostics: ExpressionDiagnostic[] = unknown.map((name) => ({
		line: 0,
		column: 0,
		offset: -1,
		severity: "ERROR",
		message: `unknown filter '${name}'`,
		phase: "filter",
	}));

	return {
		success: diagnostics.every((d) => d.severity !== "ERROR"),
		diagnostics,
	};
}

// MARK: - Helpers

function diagnosticFromError(error: ExpressionError, source: string): ExpressionDiagnostic {
	if (error.offset !== undefined) {
		const { line, column } = positionOf(error.offset, source);
		return {
			line,
			column,
			offset: error.offset,
			severity: "ERROR",
			message: error.rawMessage,
			phase: error.phase,
		};
	}
	return {
		line: 0,
		column: 0,
		offset: -1,
		severity: "ERROR",
		message: error.rawMessage,
		phase: error.phase,
	};
}

/** Map a 0-based character offset to a 1-based (line, column). */
function positionOf(offset: number, source: string): { line: number; column: number } {
	let line = 1;
	let column = 1;
	let index = 0;
	for (const character of source) {
		if (index === offset) break;
		if (character === "\n") {
			line += 1;
			column = 1;
		} else {
			column += 1;
		}
		index += 1;
	}
	return { line, column };
}

/** Collect every filter name referenced anywhere in an expression. */
function filterNames(expr: Expr): string[] {
	const names: string[] = [];
	const walk = (e: Expr): void => {
		switch (e.e) {
			case "literal":
				break;
			case "reference":
				for (const segment of e.segments) {
					if (segment.s === "dynamic") walk(segment.expr);
				}
				break;
			case "unary":
				walk(e.operand);
				break;
			case "binary":
				walk(e.lhs);
				walk(e.rhs);
				break;
			case "logical":
				e.operands.forEach(walk);
				break;
			case "conditional":
				walk(e.condition);
				walk(e.then);
				walk(e.otherwise);
				break;
			case "filter":
				names.push(e.name);
				walk(e.input);
				e.arguments.forEach(walk);
				break;
			case "arrayLiteral":
				e.elements.forEach(walk);
				break;
			case "objectLiteral":
				e.entries.forEach((entry) => walk(entry.value));
				break;
		}
	};
	walk(expr);
	return names;
}
