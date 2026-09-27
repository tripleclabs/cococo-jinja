import type { Expr } from './ast.ts';
export interface ParseLimits {
    maxSourceBytes: number;
    maxDepth: number;
    maxNodes: number;
    maxTokens: number;
}
export declare const standardParseLimits: Readonly<ParseLimits>;
/** Bare expression -> typed AST. Resource checks precede recursive parsing. */
export declare function parseBounded(source: string, limits?: ParseLimits): Expr;
