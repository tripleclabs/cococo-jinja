import type { Expr } from "./ast.ts";
import { FilterRegistry } from "./filters.ts";
import { type ExpressionLimits } from "./limits.ts";
import { type JinjaValue } from "./value.ts";
/** Evaluate `expr` against `context`, using `filters` and bounded by `limits`. */
export declare function evaluateExpr(expr: Expr, context: JinjaValue, filters?: FilterRegistry, limits?: ExpressionLimits): JinjaValue;
