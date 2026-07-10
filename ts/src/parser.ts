// parser.ts — port of Expression/Parser.swift
//
// Precedence-climbing parser: Token[] -> Expr. Precedence (lowest -> highest):
// ternary -> or -> and -> not -> comparison/in -> ~ -> + - -> * / // % ->
// unary - -> filter | -> member/index -> primary.

import type {
	BinaryOperator,
	Expr,
	ObjectEntry,
	PathSegment,
	Token,
	TokenKind,
} from "./ast.ts";
import { tokenDescription } from "./ast.ts";
import { ExpressionError } from "./errors.ts";
import { tokenize } from "./lexer.ts";
import { JV } from "./value.ts";

export function parse(tokens: Token[]): Expr {
	const state = new State(tokens);
	const expr = state.parseExpression();
	if (state.peek().kind.t !== "eof") {
		throw ExpressionError.parse(
			`unexpected ${tokenDescription(state.peek().kind)} after expression`,
			state.peek().offset,
		);
	}
	return expr;
}

/** Convenience: lex + parse a source string. */
export function parseSource(source: string): Expr {
	return parse(tokenize(source));
}

class State {
	private tokens: Token[];
	private pos = 0;

	constructor(tokens: Token[]) {
		this.tokens = tokens;
	}

	peek(): Token {
		return this.tokens[this.pos]!;
	}
	private peekAhead(ahead: number): Token {
		const i = this.pos + ahead;
		return i < this.tokens.length ? this.tokens[i]! : this.tokens[this.tokens.length - 1]!;
	}
	private advance(): Token {
		const t = this.tokens[this.pos]!;
		if (this.pos < this.tokens.length - 1) this.pos += 1;
		return t;
	}
	private matchKind(t: TokenKind["t"]): boolean {
		if (this.peek().kind.t === t) {
			this.advance();
			return true;
		}
		return false;
	}
	private expect(t: TokenKind["t"], context: string): void {
		if (this.peek().kind.t !== t) {
			throw ExpressionError.parse(
				`expected ${describeKind(t)} ${context}, found ${tokenDescription(this.peek().kind)}`,
				this.peek().offset,
			);
		}
		this.advance();
	}

	// MARK: ternary (lowest)

	parseExpression(): Expr {
		const value = this.parseOr();
		if (!this.matchKind("kwIf")) return value;
		const condition = this.parseOr();
		this.expect("kwElse", "in conditional expression");
		const otherwise = this.parseExpression(); // right-associative
		return { e: "conditional", condition, then: value, otherwise };
	}

	// MARK: or / and (n-ary)

	private parseOr(): Expr {
		const operands = [this.parseAnd()];
		while (this.matchKind("kwOr")) operands.push(this.parseAnd());
		return operands.length === 1 ? operands[0]! : { e: "logical", op: "or", operands };
	}

	private parseAnd(): Expr {
		const operands = [this.parseNot()];
		while (this.matchKind("kwAnd")) operands.push(this.parseNot());
		return operands.length === 1 ? operands[0]! : { e: "logical", op: "and", operands };
	}

	// MARK: not (prefix, looser than comparison)

	private parseNot(): Expr {
		if (this.matchKind("kwNot")) {
			return { e: "unary", op: "not", operand: this.parseNot() };
		}
		return this.parseComparison();
	}

	// MARK: comparison & membership (left-associative)

	private parseComparison(): Expr {
		let left = this.parseConcat();
		loop: while (true) {
			let op: BinaryOperator;
			switch (this.peek().kind.t) {
				case "eq":
					op = "==";
					break;
				case "neq":
					op = "!=";
					break;
				case "lt":
					op = "<";
					break;
				case "lte":
					op = "<=";
					break;
				case "gt":
					op = ">";
					break;
				case "gte":
					op = ">=";
					break;
				case "kwIn":
					op = "in";
					break;
				case "kwNot":
					if (this.peekAhead(1).kind.t === "kwIn") {
						this.advance(); // not
						this.advance(); // in
						left = { e: "binary", op: "not in", lhs: left, rhs: this.parseConcat() };
						continue loop;
					}
					break loop;
				default:
					break loop;
			}
			this.advance();
			left = { e: "binary", op, lhs: left, rhs: this.parseConcat() };
		}
		return left;
	}

	// MARK: ~ concat (left-associative)

	private parseConcat(): Expr {
		let left = this.parseAdditive();
		while (this.matchKind("tilde")) {
			left = { e: "binary", op: "~", lhs: left, rhs: this.parseAdditive() };
		}
		return left;
	}

	// MARK: additive (left-associative)

	private parseAdditive(): Expr {
		let left = this.parseMultiplicative();
		while (true) {
			let op: BinaryOperator;
			switch (this.peek().kind.t) {
				case "plus":
					op = "+";
					break;
				case "minus":
					op = "-";
					break;
				default:
					return left;
			}
			this.advance();
			left = { e: "binary", op, lhs: left, rhs: this.parseMultiplicative() };
		}
	}

	// MARK: multiplicative (left-associative)

	private parseMultiplicative(): Expr {
		let left = this.parseUnary();
		while (true) {
			let op: BinaryOperator;
			switch (this.peek().kind.t) {
				case "star":
					op = "*";
					break;
				case "slash":
					op = "/";
					break;
				case "slashSlash":
					op = "//";
					break;
				case "percent":
					op = "%";
					break;
				default:
					return left;
			}
			this.advance();
			left = { e: "binary", op, lhs: left, rhs: this.parseUnary() };
		}
	}

	// MARK: unary - / + (prefix)

	private parseUnary(): Expr {
		if (this.matchKind("plus")) {
			return this.parseUnary(); // unary plus is a no-op
		}
		if (this.matchKind("minus")) {
			const operand = this.parseUnary();
			// Constant-fold negation of a numeric literal.
			if (operand.e === "literal") {
				if (operand.value.kind === "int") {
					return { e: "literal", value: JV.int(-operand.value.value) };
				}
				if (operand.value.kind === "double") {
					return { e: "literal", value: JV.double(-operand.value.value) };
				}
			}
			return { e: "unary", op: "negate", operand };
		}
		return this.parseFilter();
	}

	// MARK: filter | (left-associative)

	private parseFilter(): Expr {
		let input = this.parsePostfix();
		while (this.matchKind("pipe")) {
			const k = this.peek().kind;
			if (k.t !== "identifier") {
				throw ExpressionError.parse(
					`expected filter name after '|', found ${tokenDescription(k)}`,
					this.peek().offset,
				);
			}
			const name = k.value;
			this.advance();
			let args: Expr[] = [];
			if (this.matchKind("lparen")) {
				args = this.parseCommaSeparated("rparen");
				this.expect("rparen", "after filter arguments");
			}
			input = { e: "filter", name, input, arguments: args };
		}
		return input;
	}

	// MARK: postfix member/index (only on identifier-rooted references)

	private parsePostfix(): Expr {
		const rootKind = this.peek().kind;
		if (rootKind.t !== "identifier") {
			return this.parsePrimary();
		}
		this.advance();
		const segments: PathSegment[] = [{ s: "key", name: rootKind.value }];
		loop: while (true) {
			switch (this.peek().kind.t) {
				case "dot": {
					this.advance();
					const nameKind = this.peek().kind;
					if (nameKind.t !== "identifier") {
						throw ExpressionError.parse(
							`expected member name after '.', found ${tokenDescription(nameKind)}`,
							this.peek().offset,
						);
					}
					this.advance();
					segments.push({ s: "key", name: nameKind.value });
					break;
				}
				case "lbracket": {
					this.advance();
					segments.push(this.parseSubscript());
					this.expect("rbracket", "after subscript");
					break;
				}
				default:
					break loop;
			}
		}
		return { e: "reference", segments };
	}

	/** Parse the contents of `[ ... ]` into a path segment. */
	private parseSubscript(): PathSegment {
		const k = this.peek().kind;
		if (k.t === "int" && this.peekAhead(1).kind.t === "rbracket") {
			this.advance();
			return { s: "index", index: k.value };
		}
		if (k.t === "string" && this.peekAhead(1).kind.t === "rbracket") {
			this.advance();
			return { s: "key", name: k.value };
		}
		return { s: "dynamic", expr: this.parseExpression() };
	}

	// MARK: primary

	private parsePrimary(): Expr {
		const token = this.peek();
		const k = token.kind;
		switch (k.t) {
			case "int":
				this.advance();
				return { e: "literal", value: JV.int(k.value) };
			case "double":
				this.advance();
				return { e: "literal", value: JV.double(k.value) };
			case "string":
				this.advance();
				return { e: "literal", value: JV.string(k.value) };
			case "kwTrue":
				this.advance();
				return { e: "literal", value: JV.bool(true) };
			case "kwFalse":
				this.advance();
				return { e: "literal", value: JV.bool(false) };
			case "kwNull":
				this.advance();
				return { e: "literal", value: JV.null };
			case "identifier":
				return this.parsePostfix();
			case "lparen": {
				this.advance();
				const inner = this.parseExpression();
				this.expect("rparen", "after parenthesized expression");
				return inner;
			}
			case "lbracket": {
				this.advance();
				const elements = this.parseCommaSeparated("rbracket");
				this.expect("rbracket", "after array literal");
				return { e: "arrayLiteral", elements };
			}
			case "lbrace":
				return this.parseObjectLiteral();
			default:
				throw ExpressionError.parse(`unexpected ${tokenDescription(k)}`, token.offset);
		}
	}

	private parseObjectLiteral(): Expr {
		this.expect("lbrace", "to open object literal");
		const entries: ObjectEntry[] = [];
		if (this.peek().kind.t !== "rbrace") {
			while (true) {
				const kk = this.peek().kind;
				let key: string;
				if (kk.t === "string") {
					key = kk.value;
					this.advance();
				} else if (kk.t === "identifier") {
					key = kk.value;
					this.advance();
				} else {
					throw ExpressionError.parse(
						`expected object key (string or identifier), found ${tokenDescription(kk)}`,
						this.peek().offset,
					);
				}
				this.expect("colon", "after object key");
				const value = this.parseExpression();
				entries.push({ key, value });
				if (this.matchKind("comma")) {
					if (this.peek().kind.t === "rbrace") break; // trailing comma
					continue;
				}
				break;
			}
		}
		this.expect("rbrace", "after object literal");
		return { e: "objectLiteral", entries };
	}

	/** Zero or more comma-separated expressions until `terminator` (not consumed). */
	private parseCommaSeparated(terminator: TokenKind["t"]): Expr[] {
		const items: Expr[] = [];
		if (this.peek().kind.t === terminator) return items;
		while (true) {
			items.push(this.parseExpression());
			if (this.matchKind("comma")) {
				if (this.peek().kind.t === terminator) break; // trailing comma
				continue;
			}
			break;
		}
		return items;
	}
}

// Describe a bare token-kind tag for `expect` messages, matching Swift's
// `TokenKind.description` for the punctuation/keyword kinds it is used with.
function describeKind(t: TokenKind["t"]): string {
	const map: Partial<Record<TokenKind["t"], string>> = {
		rparen: "')'",
		rbracket: "']'",
		rbrace: "'}'",
		lbrace: "'{'",
		colon: "':'",
		kwElse: "'else'",
	};
	return map[t] ?? `'${t}'`;
}
