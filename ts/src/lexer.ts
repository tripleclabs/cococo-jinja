// lexer.ts — port of Expression/Lexer.swift
//
// Tokenizes the contents of a single `{{ ... }}` expression span. Offsets are
// measured in characters (code points) from the start of `source`, matching the
// Swift scanner's `Array(source)` indexing for the ASCII / BMP inputs the
// dialect accepts.

import type { Token, TokenKind } from "./ast.ts";
import { ExpressionError } from "./errors.ts";

// Swift's Character.isNumber / isLetter are Unicode-aware. Identifiers here use
// the same "letter, digit, or underscore" rule; we use Unicode-property regexes
// so non-ASCII letters lex as identifiers too (as they do in Swift).
const RE_DIGIT = /\p{Nd}/u;
const RE_LETTER = /\p{L}/u;

function isNumberChar(c: string): boolean {
	return RE_DIGIT.test(c);
}
function isLetterChar(c: string): boolean {
	return RE_LETTER.test(c);
}
function isIdentContinue(c: string): boolean {
	return isLetterChar(c) || isNumberChar(c) || c === "_";
}

export function tokenize(source: string): Token[] {
	const chars = Array.from(source);
	const tokens: Token[] = [];
	let pos = 0;

	const isAtEnd = () => pos >= chars.length;
	const peek = (ahead = 0): string | undefined => {
		const i = pos + ahead;
		return i < chars.length ? chars[i] : undefined;
	};
	const match = (c: string): boolean => {
		if (peek() === c) {
			pos += 1;
			return true;
		}
		return false;
	};

	const skipWhitespace = () => {
		while (true) {
			const c = peek();
			if (c === " " || c === "\t" || c === "\n" || c === "\r") pos += 1;
			else break;
		}
	};

	const tok = (kind: TokenKind, at: number): Token => ({ kind, offset: at });

	const scanNumber = (start: number): Token => {
		let isDouble = false;
		while (peek() !== undefined && isNumberChar(peek()!)) pos += 1;
		// Fractional part — only if a digit follows the dot.
		if (peek() === "." && peek(1) !== undefined && isNumberChar(peek(1)!)) {
			isDouble = true;
			pos += 1; // consume '.'
			while (peek() !== undefined && isNumberChar(peek()!)) pos += 1;
		}
		// Exponent.
		const e = peek();
		if (e === "e" || e === "E") {
			isDouble = true;
			pos += 1;
			const s = peek();
			if (s === "+" || s === "-") pos += 1;
			const d = peek();
			if (d === undefined || !isNumberChar(d)) {
				throw ExpressionError.lex("malformed exponent in number literal", start);
			}
			while (peek() !== undefined && isNumberChar(peek()!)) pos += 1;
		}
		const text = chars.slice(start, pos).join("");
		if (isDouble) {
			const v = Number(text);
			if (!Number.isFinite(v) && text !== "inf") {
				throw ExpressionError.lex(`invalid number literal '${text}'`, start);
			}
			return tok({ t: "double", value: v }, start);
		}
		// Integer literal. Swift falls back to double when the value overflows Int
		// (64-bit). In JS we fall back once it exceeds the exact-integer range.
		const v = Number(text);
		if (Number.isSafeInteger(v)) {
			return tok({ t: "int", value: v }, start);
		}
		// Overflow → double.
		if (Number.isFinite(v)) {
			return tok({ t: "double", value: v }, start);
		}
		throw ExpressionError.lex(`invalid number literal '${text}'`, start);
	};

	const scanString = (quote: string, start: number): Token => {
		let value = "";
		while (peek() !== undefined) {
			const c = peek()!;
			pos += 1;
			if (c === quote) {
				return tok({ t: "string", value }, start);
			}
			if (c === "\\") {
				const esc = peek();
				if (esc === undefined) {
					throw ExpressionError.lex("unterminated escape in string literal", start);
				}
				pos += 1;
				switch (esc) {
					case "n":
						value += "\n";
						break;
					case "t":
						value += "\t";
						break;
					case "r":
						value += "\r";
						break;
					case "\\":
						value += "\\";
						break;
					case "'":
						value += "'";
						break;
					case '"':
						value += '"';
						break;
					case "0":
						value += "\0";
						break;
					default:
						throw ExpressionError.lex(
							`invalid escape '\\${esc}' in string literal`,
							start,
						);
				}
			} else {
				value += c;
			}
		}
		throw ExpressionError.lex("unterminated string literal", start);
	};

	const scanIdentifierOrKeyword = (start: number): Token => {
		while (peek() !== undefined && isIdentContinue(peek()!)) pos += 1;
		const text = chars.slice(start, pos).join("");
		switch (text) {
			case "true":
				return tok({ t: "kwTrue" }, start);
			case "false":
				return tok({ t: "kwFalse" }, start);
			case "null":
			case "none":
				return tok({ t: "kwNull" }, start);
			case "and":
				return tok({ t: "kwAnd" }, start);
			case "or":
				return tok({ t: "kwOr" }, start);
			case "not":
				return tok({ t: "kwNot" }, start);
			case "in":
				return tok({ t: "kwIn" }, start);
			case "if":
				return tok({ t: "kwIf" }, start);
			case "else":
				return tok({ t: "kwElse" }, start);
			default:
				return tok({ t: "identifier", value: text }, start);
		}
	};

	while (true) {
		skipWhitespace();
		const start = pos;
		if (isAtEnd()) {
			tokens.push(tok({ t: "eof" }, start));
			break;
		}
		const c = chars[pos]!;
		pos += 1;
		switch (c) {
			case "(":
				tokens.push(tok({ t: "lparen" }, start));
				continue;
			case ")":
				tokens.push(tok({ t: "rparen" }, start));
				continue;
			case "[":
				tokens.push(tok({ t: "lbracket" }, start));
				continue;
			case "]":
				tokens.push(tok({ t: "rbracket" }, start));
				continue;
			case "{":
				tokens.push(tok({ t: "lbrace" }, start));
				continue;
			case "}":
				tokens.push(tok({ t: "rbrace" }, start));
				continue;
			case ",":
				tokens.push(tok({ t: "comma" }, start));
				continue;
			case ":":
				tokens.push(tok({ t: "colon" }, start));
				continue;
			case ".":
				tokens.push(tok({ t: "dot" }, start));
				continue;
			case "|":
				tokens.push(tok({ t: "pipe" }, start));
				continue;
			case "+":
				tokens.push(tok({ t: "plus" }, start));
				continue;
			case "-":
				tokens.push(tok({ t: "minus" }, start));
				continue;
			case "*":
				tokens.push(tok({ t: "star" }, start));
				continue;
			case "%":
				tokens.push(tok({ t: "percent" }, start));
				continue;
			case "~":
				tokens.push(tok({ t: "tilde" }, start));
				continue;
			case "/":
				tokens.push(tok({ t: match("/") ? "slashSlash" : "slash" }, start));
				continue;
			case "=":
				if (!match("=")) {
					throw ExpressionError.lex("unexpected '='; did you mean '=='?", start);
				}
				tokens.push(tok({ t: "eq" }, start));
				continue;
			case "!":
				if (!match("=")) {
					throw ExpressionError.lex("unexpected '!'; use 'not' for negation", start);
				}
				tokens.push(tok({ t: "neq" }, start));
				continue;
			case "<":
				tokens.push(tok({ t: match("=") ? "lte" : "lt" }, start));
				continue;
			case ">":
				tokens.push(tok({ t: match("=") ? "gte" : "gt" }, start));
				continue;
			case "'":
			case '"':
				tokens.push(scanString(c, start));
				continue;
			default:
				if (isNumberChar(c)) {
					// Rewind one — scanNumber expects to consume from `start`.
					pos = start;
					tokens.push(scanNumber(start));
					continue;
				}
				if (isLetterChar(c) || c === "_") {
					pos = start;
					tokens.push(scanIdentifierOrKeyword(start));
					continue;
				}
				throw ExpressionError.lex(`unexpected character '${c}'`, start);
		}
	}

	return tokens;
}
