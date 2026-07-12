import { FilterRegistry } from "./filters.ts";
import type { ExpressionLimits } from "./limits.ts";
import { type JinjaValue } from "./value.ts";
export type { JinjaValue } from "./value.ts";
export { asDouble, type ComparisonResult, decodeJinjaValue, decodeJinjaValueString, element, fromJSON, fromJSONString, getPath, member, isNumeric, isTruthy, JV, orderedAscending, orderedDescending, orderedSame, renderDouble, renderedString, semanticCompare, semanticEquals, toJSONLogicValue, toJSONString, typeName, } from "./value.ts";
export { ExpressionError, type ExpressionPhase } from "./errors.ts";
export { type ExpressionLimits, makeLimits, standardLimits } from "./limits.ts";
export type { BinaryOperator, Expr, LogicalOperator, ObjectEntry, PathSegment, Token, TokenKind, UnaryOperator, } from "./ast.ts";
export { tokenize } from "./lexer.ts";
export { parse, parseSource } from "./parser.ts";
export { evaluateExpr } from "./interpreter.ts";
export { type ExpressionFilter, FilterRegistry, standardFilters, } from "./filters.ts";
export { printExpr } from "./printer.ts";
export { scan, type Segment, singleExpression, templateEvaluate, templateRender, } from "./template.ts";
export { type ExpressionDiagnostic, type ExpressionDiagnosticSeverity, type ExpressionFormat, type ExpressionValidationResult, validate, } from "./validator.ts";
/** A context is either a tagged JinjaValue or a plain JS JSON graph. */
export type Context = JinjaValue | Record<string, unknown> | unknown;
/**
 * Smart evaluation: a single `{{ expr }}` span (modulo surrounding whitespace)
 * returns its TYPED `JinjaValue`; anything else (plaintext, mixed, multi-span)
 * returns a `.string`. `context` is the single root object addressed by bare
 * identifiers inside `{{ }}`.
 */
export declare function evaluate(source: string, context: Context, filters?: FilterRegistry, limits?: ExpressionLimits): JinjaValue;
/** Always render to a string (the explicit text projection). */
export declare function render(source: string, context: Context, filters?: FilterRegistry, limits?: ExpressionLimits): string;
