import type { Expr, Token } from "./ast.ts";
export declare function parse(tokens: Token[]): Expr;
/** Convenience: lex + parse a source string. */
export declare function parseSource(source: string): Expr;
