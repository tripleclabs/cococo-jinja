// limits.ts — port of Expression/ExpressionLimits.swift
//
// Execution budget for expression evaluation. Every limit surfaces as a typed
// ExpressionError; script-reachable code never crashes.

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
export const standardLimits: ExpressionLimits = {
	maxDepth: 64,
	maxOperations: 10_000,
	maxStringLength: 100_000,
	maxCollectionSize: 10_000,
};

/** Build a limits object, filling any omitted field from `standardLimits`. */
export function makeLimits(partial: Partial<ExpressionLimits> = {}): ExpressionLimits {
	const l: ExpressionLimits = { ...standardLimits, ...partial };
	if (
		!(l.maxDepth > 0 && l.maxOperations > 0 && l.maxStringLength > 0 && l.maxCollectionSize > 0)
	) {
		throw new Error("ExpressionLimits guardrails must all be positive");
	}
	return l;
}
