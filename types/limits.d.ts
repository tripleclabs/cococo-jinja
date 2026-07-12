export interface ExpressionLimits {
    /** Maximum AST recursion depth (guards pathological nesting). */
    maxDepth: number;
    /** Maximum number of evaluation steps (guards expensive/large evaluations). */
    maxOperations: number;
    /** Maximum length of any produced string (concat / render). */
    maxStringLength: number;
    /** Maximum element count of any produced collection (array/object building). */
    maxCollectionSize: number;
}
/** Pulse's default budget for workflow expressions. */
export declare const standardLimits: ExpressionLimits;
/** Build a limits object, filling any omitted field from `standardLimits`. */
export declare function makeLimits(partial?: Partial<ExpressionLimits>): ExpressionLimits;
