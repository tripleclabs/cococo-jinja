export type ExpressionPhase = "lex" | "parse" | "evaluate";
/**
 * An error raised while lexing, parsing, or evaluating a workflow expression.
 * Mirrors Swift's `ExpressionError` struct: a `phase`, a `message`, and an
 * optional character `offset` (present for lex/parse errors, absent for
 * evaluation errors not tied to a span).
 */
export declare class ExpressionError extends Error {
    readonly phase: ExpressionPhase;
    readonly offset: number | undefined;
    constructor(phase: ExpressionPhase, message: string, offset?: number);
    /** The raw message, without the `phase error at N:` prefix. */
    readonly rawMessage: string;
    static lex(message: string, offset: number): ExpressionError;
    static parse(message: string, offset?: number): ExpressionError;
    static evaluate(message: string): ExpressionError;
}
