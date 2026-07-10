//
//  Lexer.swift
//  CococoJinja
//
//  Copyright Triple C Labs GmbH
//
//  Tokenizes the contents of a single `{{ ... }}` expression span. The template
//  layer (splitting text from expression spans) lives in the evaluator; this
//  operates purely on expression source. See docs/workflow-expression-dialect.md §4.
//

import Foundation

enum Lexer {
    /// Tokenize an expression source string into tokens, terminated by `.eof`.
    /// Offsets are measured in Unicode scalars from the start of `source`.
    static func tokenize(_ source: String) throws -> [Token] {
        var scanner = Scanner(source)
        var tokens: [Token] = []
        while let token = try scanner.next() {
            tokens.append(token)
            if token.kind == .eof { break }
        }
        return tokens
    }

    // MARK: - Scanner

    private struct Scanner {
        private let chars: [Character]
        private var pos = 0

        init(_ source: String) {
            self.chars = Array(source)
        }

        private var isAtEnd: Bool { pos >= chars.count }

        private func peek(_ ahead: Int = 0) -> Character? {
            let i = pos + ahead
            return i < chars.count ? chars[i] : nil
        }

        @discardableResult
        private mutating func advance() -> Character {
            defer { pos += 1 }
            return chars[pos]
        }

        private mutating func match(_ c: Character) -> Bool {
            guard peek() == c else { return false }
            pos += 1
            return true
        }

        mutating func next() throws -> Token? {
            skipWhitespace()
            let start = pos
            guard !isAtEnd else { return Token(.eof, at: start) }

            let c = advance()
            switch c {
            case "(": return Token(.lparen, at: start)
            case ")": return Token(.rparen, at: start)
            case "[": return Token(.lbracket, at: start)
            case "]": return Token(.rbracket, at: start)
            case "{": return Token(.lbrace, at: start)
            case "}": return Token(.rbrace, at: start)
            case ",": return Token(.comma, at: start)
            case ":": return Token(.colon, at: start)
            case ".":
                // A leading-dot number like `.5` is not supported; `.` is always
                // member access here.
                return Token(.dot, at: start)
            case "|": return Token(.pipe, at: start)
            case "+": return Token(.plus, at: start)
            case "-": return Token(.minus, at: start)
            case "*": return Token(.star, at: start)
            case "%": return Token(.percent, at: start)
            case "~": return Token(.tilde, at: start)
            case "/":
                return Token(match("/") ? .slashSlash : .slash, at: start)
            case "=":
                guard match("=") else {
                    throw ExpressionError.lex("unexpected '='; did you mean '=='?", at: start)
                }
                return Token(.eq, at: start)
            case "!":
                guard match("=") else {
                    throw ExpressionError.lex("unexpected '!'; use 'not' for negation", at: start)
                }
                return Token(.neq, at: start)
            case "<":
                return Token(match("=") ? .lte : .lt, at: start)
            case ">":
                return Token(match("=") ? .gte : .gt, at: start)
            case "'", "\"":
                return try string(opening: c, start: start)
            default:
                if c.isNumber {
                    return try number(start: start)
                }
                if c.isLetter || c == "_" {
                    return identifierOrKeyword(start: start)
                }
                throw ExpressionError.lex("unexpected character '\(c)'", at: start)
            }
        }

        private mutating func skipWhitespace() {
            while let c = peek(), c == " " || c == "\t" || c == "\n" || c == "\r" {
                pos += 1
            }
        }

        // MARK: literals

        private mutating func number(start: Int) throws -> Token {
            // `start` is the index of the first digit (already consumed).
            var isDouble = false
            while let c = peek(), c.isNumber { pos += 1 }
            // Fractional part — only if a digit follows the dot (so `x.0` member
            // access on a number isn't mis-lexed; here it's a numeric literal).
            if peek() == ".", let after = peek(1), after.isNumber {
                isDouble = true
                pos += 1 // consume '.'
                while let c = peek(), c.isNumber { pos += 1 }
            }
            // Exponent.
            if let c = peek(), c == "e" || c == "E" {
                isDouble = true
                pos += 1
                if let s = peek(), s == "+" || s == "-" { pos += 1 }
                guard let d = peek(), d.isNumber else {
                    throw ExpressionError.lex("malformed exponent in number literal", at: start)
                }
                while let c = peek(), c.isNumber { pos += 1 }
            }
            let text = String(chars[start..<pos])
            if isDouble {
                guard let v = Double(text) else {
                    throw ExpressionError.lex("invalid number literal '\(text)'", at: start)
                }
                return Token(.double(v), at: start)
            }
            guard let v = Int(text) else {
                // Integer literal that overflows Int — fall back to double.
                guard let d = Double(text) else {
                    throw ExpressionError.lex("invalid number literal '\(text)'", at: start)
                }
                return Token(.double(d), at: start)
            }
            return Token(.int(v), at: start)
        }

        private mutating func string(opening quote: Character, start: Int) throws -> Token {
            var value = ""
            while let c = peek() {
                pos += 1
                if c == quote {
                    return Token(.string(value), at: start)
                }
                if c == "\\" {
                    guard let esc = peek() else {
                        throw ExpressionError.lex("unterminated escape in string literal", at: start)
                    }
                    pos += 1
                    switch esc {
                    case "n": value.append("\n")
                    case "t": value.append("\t")
                    case "r": value.append("\r")
                    case "\\": value.append("\\")
                    case "'": value.append("'")
                    case "\"": value.append("\"")
                    case "0": value.append("\0")
                    default:
                        throw ExpressionError.lex("invalid escape '\\\(esc)' in string literal", at: start)
                    }
                } else {
                    value.append(c)
                }
            }
            throw ExpressionError.lex("unterminated string literal", at: start)
        }

        private mutating func identifierOrKeyword(start: Int) -> Token {
            while let c = peek(), c.isLetter || c.isNumber || c == "_" { pos += 1 }
            let text = String(chars[start..<pos])
            switch text {
            case "true": return Token(.kwTrue, at: start)
            case "false": return Token(.kwFalse, at: start)
            case "null", "none": return Token(.kwNull, at: start)
            case "and": return Token(.kwAnd, at: start)
            case "or": return Token(.kwOr, at: start)
            case "not": return Token(.kwNot, at: start)
            case "in": return Token(.kwIn, at: start)
            case "if": return Token(.kwIf, at: start)
            case "else": return Token(.kwElse, at: start)
            default: return Token(.identifier(text), at: start)
            }
        }
    }
}
