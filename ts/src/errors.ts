// errors.ts — port of Expression/ExpressionError.swift
//
// An error raised while lexing, parsing, or evaluating a workflow expression.

export type ExpressionPhase = "lex" | "parse" | "evaluate";

/**
 * An error raised while lexing, parsing, or evaluating a workflow expression.
 * Mirrors Swift's `ExpressionError` struct: a `phase`, a `message`, and an
 * optional character `offset` (present for lex/parse errors, absent for
 * evaluation errors not tied to a span).
 */
export class ExpressionError extends Error {
	readonly phase: ExpressionPhase;
	readonly offset: number | undefined;

	constructor(phase: ExpressionPhase, message: string, offset?: number) {
		super(
			offset !== undefined
				? `${phase} error at ${offset}: ${message}`
				: `${phase} error: ${message}`,
		);
		this.name = "ExpressionError";
		this.phase = phase;
		// Swift keeps `message` separate from `errorDescription`; expose the raw
		// message too so the validator can render diagnostics faithfully.
		this.rawMessage = message;
		this.offset = offset;
		Object.setPrototypeOf(this, ExpressionError.prototype);
	}

	/** The raw message, without the `phase error at N:` prefix. */
	readonly rawMessage: string;

	static lex(message: string, offset: number): ExpressionError {
		return new ExpressionError("lex", message, offset);
	}

	static parse(message: string, offset?: number): ExpressionError {
		return new ExpressionError("parse", message, offset);
	}

	static evaluate(message: string): ExpressionError {
		return new ExpressionError("evaluate", message);
	}
}
