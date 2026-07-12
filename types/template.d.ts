import type { Expr } from "./ast.ts";
import { FilterRegistry } from "./filters.ts";
import { type ExpressionLimits } from "./limits.ts";
import { type JinjaValue } from "./value.ts";
export type Segment = {
    s: "text";
    text: string;
} | {
    s: "expression";
    expr: Expr;
};
/** Smart evaluation: typed value for a single expression span, else a string. */
export declare function templateEvaluate(source: string, context: JinjaValue, filters?: FilterRegistry, limits?: ExpressionLimits): JinjaValue;
/** Always render to a string (the explicit text projection). */
export declare function templateRender(source: string, context: JinjaValue, filters?: FilterRegistry, limits?: ExpressionLimits): string;
/**
 * The parsed expression if `source` is a single `{{ expr }}` span (modulo
 * surrounding whitespace); `undefined` for plaintext / mixed / multi-span.
 */
export declare function singleExpression(source: string): Expr | undefined;
export declare function scan(source: string): Segment[];
