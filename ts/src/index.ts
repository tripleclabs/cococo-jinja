// @cococo/jinja — TS peer of the canonical Jinja-subset engine (Swift: CococoJinja).
//
// Same behaviour as the Swift engine, proven by the shared `fixtures/`. The
// modules mirror the Swift layout: value, errors, limits, ast, lexer, parser,
// filters, interpreter, printer, template, validator.
//
// INT/DOUBLE DECISION: JS `number` cannot distinguish Swift's `.int` from
// `.double`, so `JinjaValue` here is a TAGGED discriminated union (see value.ts).
// Rendering (`12` vs `12.0`) and arithmetic (int stays int; `/` yields double;
// `//`/`%` floor; `round` → double) all key off the tag, matching Swift exactly.

import { FilterRegistry } from "./filters.ts";
import type { ExpressionLimits } from "./limits.ts";
import { standardLimits } from "./limits.ts";
import { templateEvaluate, templateRender } from "./template.ts";
import { fromJSON, type JinjaValue } from "./value.ts";

// MARK: - Re-exports (the value model + semantics + engine internals)

export type { JinjaValue } from "./value.ts";
export {
	asDouble,
	type ComparisonResult,
	decodeJinjaValue,
	decodeJinjaValueString,
	element,
	fromJSON,
	fromJSONString,
	getPath,
	member,
	isNumeric,
	isTruthy,
	JV,
	orderedAscending,
	orderedDescending,
	orderedSame,
	renderDouble,
	renderedString,
	semanticCompare,
	semanticEquals,
	toJSONLogicValue,
	toJSONString,
	typeName,
} from "./value.ts";
export { ExpressionError, type ExpressionPhase } from "./errors.ts";
export { type ExpressionLimits, makeLimits, standardLimits } from "./limits.ts";
export type {
	BinaryOperator,
	Expr,
	LogicalOperator,
	ObjectEntry,
	PathSegment,
	Token,
	TokenKind,
	UnaryOperator,
} from "./ast.ts";
export { tokenize } from "./lexer.ts";
export { parse, parseSource } from "./parser.ts";
export { evaluateExpr } from "./interpreter.ts";
export {
	type ExpressionFilter,
	FilterRegistry,
	standardFilters,
} from "./filters.ts";
export { printExpr } from "./printer.ts";
export {
	scan,
	type Segment,
	singleExpression,
	templateEvaluate,
	templateRender,
} from "./template.ts";
export {
	type ExpressionDiagnostic,
	type ExpressionDiagnosticSeverity,
	type ExpressionFormat,
	type ExpressionValidationResult,
	validate,
} from "./validator.ts";

// MARK: - Public API (mirrors Swift's ExpressionTemplate.evaluate / .render)

/** A context is either a tagged JinjaValue or a plain JS JSON graph. */
export type Context = JinjaValue | Record<string, unknown> | unknown;

function toContext(context: Context): JinjaValue {
	// A tagged JinjaValue already has a `kind` discriminator.
	if (
		context !== null &&
		typeof context === "object" &&
		"kind" in (context as Record<string, unknown>) &&
		typeof (context as { kind: unknown }).kind === "string"
	) {
		return context as JinjaValue;
	}
	return fromJSON(context);
}

/**
 * Smart evaluation: a single `{{ expr }}` span (modulo surrounding whitespace)
 * returns its TYPED `JinjaValue`; anything else (plaintext, mixed, multi-span)
 * returns a `.string`. `context` is the single root object addressed by bare
 * identifiers inside `{{ }}`.
 */
export function evaluate(
	source: string,
	context: Context,
	filters: FilterRegistry = FilterRegistry.standard,
	limits: ExpressionLimits = standardLimits,
): JinjaValue {
	return templateEvaluate(source, toContext(context), filters, limits);
}

/** Always render to a string (the explicit text projection). */
export function render(
	source: string,
	context: Context,
	filters: FilterRegistry = FilterRegistry.standard,
	limits: ExpressionLimits = standardLimits,
): string {
	return templateRender(source, toContext(context), filters, limits);
}
