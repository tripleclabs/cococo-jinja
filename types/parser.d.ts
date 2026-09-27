import type { Expr, Token } from "./ast.ts";
export declare function parse(tokens: Token[], maxDepth?: number): Expr;
/** Convenience: lex + parse a source string. */
export declare function parseSource(source: string): Expr;
