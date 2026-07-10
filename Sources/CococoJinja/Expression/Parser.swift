//
//  Parser.swift
//  CococoJinja
//
//  Copyright Triple C Labs GmbH
//
//  Precedence-climbing parser: [Token] -> Expr. Precedence (lowest -> highest):
//  ternary -> or -> and -> not -> comparison/in -> ~ -> + - -> * / // % ->
//  unary - -> filter | -> member/index -> primary.
//  See docs/workflow-expression-dialect.md §4.
//
//  Member/index access is only valid from an identifier root (a reference); you
//  cannot index a literal or a filter result (`[1,2][0]`, `(x).y` do not parse).
//

import Foundation

enum Parser {
    /// Parse a complete expression. Throws if there are trailing tokens.
    static func parse(_ tokens: [Token]) throws -> Expr {
        var state = State(tokens)
        let expr = try state.parseExpression()
        guard state.peek.kind == .eof else {
            throw ExpressionError.parse(
                "unexpected \(state.peek.kind.description) after expression",
                at: state.peek.offset
            )
        }
        return expr
    }

    /// Convenience: lex + parse a source string.
    static func parse(source: String) throws -> Expr {
        try parse(Lexer.tokenize(source))
    }

    // MARK: - Parser state

    private struct State {
        private let tokens: [Token]
        private var pos = 0

        init(_ tokens: [Token]) {
            // `tokens` always ends in `.eof` (Lexer guarantees it).
            self.tokens = tokens
        }

        var peek: Token { tokens[pos] }
        private func peek(_ ahead: Int) -> Token {
            let i = pos + ahead
            return i < tokens.count ? tokens[i] : tokens[tokens.count - 1]
        }

        @discardableResult
        private mutating func advance() -> Token {
            defer { if pos < tokens.count - 1 { pos += 1 } }
            return tokens[pos]
        }

        private mutating func match(_ kind: TokenKind) -> Bool {
            guard peek.kind == kind else { return false }
            advance()
            return true
        }

        private mutating func expect(_ kind: TokenKind, _ context: String) throws {
            guard peek.kind == kind else {
                throw ExpressionError.parse(
                    "expected \(kind.description) \(context), found \(peek.kind.description)",
                    at: peek.offset
                )
            }
            advance()
        }

        // MARK: ternary (lowest)

        mutating func parseExpression() throws -> Expr {
            let value = try parseOr()
            guard match(.kwIf) else { return value }
            let condition = try parseOr()
            try expect(.kwElse, "in conditional expression")
            let otherwise = try parseExpression() // right-associative
            return .conditional(condition: condition, then: value, otherwise: otherwise)
        }

        // MARK: or / and (n-ary)

        private mutating func parseOr() throws -> Expr {
            var operands = [try parseAnd()]
            while match(.kwOr) { operands.append(try parseAnd()) }
            return operands.count == 1 ? operands[0] : .logical(.or, operands)
        }

        private mutating func parseAnd() throws -> Expr {
            var operands = [try parseNot()]
            while match(.kwAnd) { operands.append(try parseNot()) }
            return operands.count == 1 ? operands[0] : .logical(.and, operands)
        }

        // MARK: not (prefix, looser than comparison)

        private mutating func parseNot() throws -> Expr {
            if match(.kwNot) {
                return .unary(.not, try parseNot())
            }
            return try parseComparison()
        }

        // MARK: comparison & membership (left-associative)

        private mutating func parseComparison() throws -> Expr {
            var left = try parseConcat()
            loop: while true {
                let op: BinaryOperator
                switch peek.kind {
                case .eq: op = .eq
                case .neq: op = .neq
                case .lt: op = .lt
                case .lte: op = .lte
                case .gt: op = .gt
                case .gte: op = .gte
                case .kwIn: op = .contains
                case .kwNot where peek(1).kind == .kwIn:
                    advance() // not
                    advance() // in
                    left = .binary(.notContains, left, try parseConcat())
                    continue loop
                default:
                    break loop
                }
                advance()
                left = .binary(op, left, try parseConcat())
            }
            return left
        }

        // MARK: ~ concat (left-associative)

        private mutating func parseConcat() throws -> Expr {
            var left = try parseAdditive()
            while match(.tilde) {
                left = .binary(.concat, left, try parseAdditive())
            }
            return left
        }

        // MARK: additive (left-associative)

        private mutating func parseAdditive() throws -> Expr {
            var left = try parseMultiplicative()
            while true {
                let op: BinaryOperator
                switch peek.kind {
                case .plus: op = .add
                case .minus: op = .subtract
                default: return left
                }
                advance()
                left = .binary(op, left, try parseMultiplicative())
            }
        }

        // MARK: multiplicative (left-associative)

        private mutating func parseMultiplicative() throws -> Expr {
            var left = try parseUnary()
            while true {
                let op: BinaryOperator
                switch peek.kind {
                case .star: op = .multiply
                case .slash: op = .divide
                case .slashSlash: op = .floorDivide
                case .percent: op = .modulo
                default: return left
                }
                advance()
                left = .binary(op, left, try parseUnary())
            }
        }

        // MARK: unary - / + (prefix)

        private mutating func parseUnary() throws -> Expr {
            if match(.plus) {
                return try parseUnary() // unary plus is a no-op
            }
            if match(.minus) {
                let operand = try parseUnary()
                // Constant-fold negation of a numeric literal so `-5` stays a bare
                // literal (keeps it inside the builder's rule subset, §5).
                switch operand {
                case let .literal(.int(n)): return .literal(.int(-n))
                case let .literal(.double(d)): return .literal(.double(-d))
                default: return .unary(.negate, operand)
                }
            }
            return try parseFilter()
        }

        // MARK: filter | (left-associative)

        private mutating func parseFilter() throws -> Expr {
            var input = try parsePostfix()
            while match(.pipe) {
                guard case let .identifier(name) = peek.kind else {
                    throw ExpressionError.parse(
                        "expected filter name after '|', found \(peek.kind.description)",
                        at: peek.offset
                    )
                }
                advance()
                var args: [Expr] = []
                if match(.lparen) {
                    args = try parseCommaSeparated(until: .rparen)
                    try expect(.rparen, "after filter arguments")
                }
                input = .filter(name: name, input: input, arguments: args)
            }
            return input
        }

        // MARK: postfix member/index (only on identifier-rooted references)

        private mutating func parsePostfix() throws -> Expr {
            // Only an identifier starts a reference with member/index access.
            guard case let .identifier(root) = peek.kind else {
                return try parsePrimary()
            }
            advance()
            var segments: [PathSegment] = [.key(root)]
            loop: while true {
                switch peek.kind {
                case .dot:
                    advance()
                    guard case let .identifier(name) = peek.kind else {
                        throw ExpressionError.parse(
                            "expected member name after '.', found \(peek.kind.description)",
                            at: peek.offset
                        )
                    }
                    advance()
                    segments.append(.key(name))
                case .lbracket:
                    advance()
                    segments.append(try parseSubscript())
                    try expect(.rbracket, "after subscript")
                default:
                    break loop
                }
            }
            return .reference(segments)
        }

        /// Parse the contents of `[ ... ]` into a path segment.
        private mutating func parseSubscript() throws -> PathSegment {
            // Literal int → index; literal string → key; anything else → dynamic.
            switch peek.kind {
            case let .int(n) where peek(1).kind == .rbracket:
                advance()
                return .index(n)
            case let .string(s) where peek(1).kind == .rbracket:
                advance()
                return .key(s)
            default:
                return .dynamic(try parseExpression())
            }
        }

        // MARK: primary

        private mutating func parsePrimary() throws -> Expr {
            let token = peek
            switch token.kind {
            case let .int(v):
                advance(); return .literal(.int(v))
            case let .double(v):
                advance(); return .literal(.double(v))
            case let .string(v):
                advance(); return .literal(.string(v))
            case .kwTrue:
                advance(); return .literal(.bool(true))
            case .kwFalse:
                advance(); return .literal(.bool(false))
            case .kwNull:
                advance(); return .literal(.null)
            case .identifier:
                // Reached only when not handled by parsePostfix (it always is),
                // but kept for completeness.
                return try parsePostfix()
            case .lparen:
                advance()
                let inner = try parseExpression()
                try expect(.rparen, "after parenthesized expression")
                return inner
            case .lbracket:
                advance()
                let elements = try parseCommaSeparated(until: .rbracket)
                try expect(.rbracket, "after array literal")
                return .arrayLiteral(elements)
            case .lbrace:
                return try parseObjectLiteral()
            default:
                throw ExpressionError.parse(
                    "unexpected \(token.kind.description)",
                    at: token.offset
                )
            }
        }

        private mutating func parseObjectLiteral() throws -> Expr {
            try expect(.lbrace, "to open object literal")
            var entries: [ObjectEntry] = []
            if peek.kind != .rbrace {
                while true {
                    let key: String
                    switch peek.kind {
                    case let .string(s): key = s; advance()
                    case let .identifier(name): key = name; advance()
                    default:
                        throw ExpressionError.parse(
                            "expected object key (string or identifier), found \(peek.kind.description)",
                            at: peek.offset
                        )
                    }
                    try expect(.colon, "after object key")
                    let value = try parseExpression()
                    entries.append(ObjectEntry(key: key, value: value))
                    if match(.comma) {
                        if peek.kind == .rbrace { break } // trailing comma
                        continue
                    }
                    break
                }
            }
            try expect(.rbrace, "after object literal")
            return .objectLiteral(entries)
        }

        /// Parse zero or more comma-separated expressions, stopping at `terminator`
        /// (which is NOT consumed). Allows a single trailing comma.
        private mutating func parseCommaSeparated(until terminator: TokenKind) throws -> [Expr] {
            var items: [Expr] = []
            if peek.kind == terminator { return items }
            while true {
                items.append(try parseExpression())
                if match(.comma) {
                    if peek.kind == terminator { break } // trailing comma
                    continue
                }
                break
            }
            return items
        }
    }
}
