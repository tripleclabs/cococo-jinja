import type { Expr, Token } from "./ast.ts";
/**
 * Parse a complete expression. Throws if there are trailing tokens.
 *
 * Without `maxDepth` the parse is bounded by the standard budget (matching
 * Swift/WorkflowKit): at most `standardLimits.maxOperations` tokens, parser
 * recursion of `maxDepth * 4`, and an AST nesting depth of `standardLimits.maxDepth`.
 * With `maxDepth`, only that recursion bound applies (used by `parseBounded`,
 * which enforces its own token/node/depth limits).
 */
export declare function parse(tokens: Token[], maxDepth?: number): Expr;
/** Convenience: lex + parse a source string. */
export declare function parseSource(source: string): Expr;
