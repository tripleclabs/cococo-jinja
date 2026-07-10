//
//  LexerTests.swift
//  CococoJinjaTests
//
//  Copyright Triple C Labs GmbH
//

import Foundation
import Testing

@testable import CococoJinja

@Suite("Expression lexer")
struct LexerTests {

    /// Tokenize and return the kinds, dropping the trailing `.eof`.
    private func kinds(_ source: String) throws -> [TokenKind] {
        let tokens = try Lexer.tokenize(source)
        #expect(tokens.last?.kind == .eof)
        return tokens.dropLast().map(\.kind)
    }

    // MARK: - Numbers

    @Test("Integer literals")
    func integers() throws {
        #expect(try kinds("0") == [.int(0)])
        #expect(try kinds("42") == [.int(42)])
        #expect(try kinds("1000000") == [.int(1_000_000)])
    }

    @Test("Double literals: fraction and exponent")
    func doubles() throws {
        #expect(try kinds("3.14") == [.double(3.14)])
        #expect(try kinds("1.0") == [.double(1.0)])
        #expect(try kinds("1e3") == [.double(1000)])
        #expect(try kinds("2.5e-2") == [.double(0.025)])
        #expect(try kinds("6E2") == [.double(600)])
    }

    @Test("Integer overflow falls back to double")
    func integerOverflow() throws {
        let toks = try kinds("99999999999999999999")
        guard case .double = toks.first else {
            Issue.record("expected double fallback, got \(toks)")
            return
        }
    }

    @Test("Dot after number is member access, not a fraction without trailing digit")
    func dotMemberAccessVsFraction() throws {
        // `1.foo` → int 1, dot, identifier foo  (member access)
        #expect(try kinds("1.foo") == [.int(1), .dot, .identifier("foo")])
        // `1.5` → double
        #expect(try kinds("1.5") == [.double(1.5)])
    }

    @Test("Malformed exponent throws")
    func malformedExponent() {
        #expect(throws: ExpressionError.self) { _ = try Lexer.tokenize("1e") }
        #expect(throws: ExpressionError.self) { _ = try Lexer.tokenize("1e+") }
    }

    // MARK: - Strings

    @Test("String literals with both quote styles")
    func strings() throws {
        #expect(try kinds("'hello'") == [.string("hello")])
        #expect(try kinds("\"world\"") == [.string("world")])
        #expect(try kinds("''") == [.string("")])
    }

    @Test("String escapes")
    func stringEscapes() throws {
        #expect(try kinds(#"'a\nb'"#) == [.string("a\nb")])
        #expect(try kinds(#"'tab\tend'"#) == [.string("tab\tend")])
        #expect(try kinds(#"'quote\'s'"#) == [.string("quote's")])
        #expect(try kinds(#""back\\slash""#) == [.string("back\\slash")])
    }

    @Test("Unterminated string throws")
    func unterminatedString() {
        #expect(throws: ExpressionError.self) { _ = try Lexer.tokenize("'oops") }
    }

    @Test("Invalid escape throws")
    func invalidEscape() {
        #expect(throws: ExpressionError.self) { _ = try Lexer.tokenize(#"'\q'"#) }
    }

    // MARK: - Keywords & identifiers

    @Test("Keywords")
    func keywords() throws {
        #expect(try kinds("true false null none") == [.kwTrue, .kwFalse, .kwNull, .kwNull])
        #expect(try kinds("and or not in if else") == [.kwAnd, .kwOr, .kwNot, .kwIn, .kwIf, .kwElse])
    }

    @Test("Identifiers, including ones that contain keyword substrings")
    func identifiers() throws {
        #expect(try kinds("input") == [.identifier("input")])
        #expect(try kinds("_private") == [.identifier("_private")])
        #expect(try kinds("node1") == [.identifier("node1")])
        #expect(try kinds("android") == [.identifier("android")]) // not 'and'
        #expect(try kinds("information") == [.identifier("information")]) // not 'in'
    }

    // MARK: - Operators & punctuation

    @Test("Multi-character operators")
    func multiCharOperators() throws {
        #expect(try kinds("== != <= >= //") == [.eq, .neq, .lte, .gte, .slashSlash])
    }

    @Test("Single-character operators and punctuation")
    func singleCharTokens() throws {
        #expect(try kinds("< > + - * / % ~") == [.lt, .gt, .plus, .minus, .star, .slash, .percent, .tilde])
        #expect(try kinds("( ) [ ] { } , : . |") == [
            .lparen, .rparen, .lbracket, .rbracket, .lbrace, .rbrace, .comma, .colon, .dot, .pipe,
        ])
    }

    @Test("Lone = and lone ! throw")
    func loneEqualsAndBang() {
        #expect(throws: ExpressionError.self) { _ = try Lexer.tokenize("a = b") }
        #expect(throws: ExpressionError.self) { _ = try Lexer.tokenize("!a") }
    }

    @Test("Unexpected character throws")
    func unexpectedCharacter() {
        #expect(throws: ExpressionError.self) { _ = try Lexer.tokenize("a @ b") }
    }

    // MARK: - Whitespace & offsets

    @Test("Whitespace is skipped")
    func whitespace() throws {
        #expect(try kinds("  a\t+\n b ") == [.identifier("a"), .plus, .identifier("b")])
        #expect(try kinds("") == [])
    }

    @Test("Token offsets point at the token start")
    func offsets() throws {
        let tokens = try Lexer.tokenize("a + 42")
        #expect(tokens[0].offset == 0) // a
        #expect(tokens[1].offset == 2) // +
        #expect(tokens[2].offset == 4) // 42
    }

    @Test("Error offset points at the offending character")
    func errorOffset() {
        do {
            _ = try Lexer.tokenize("ok @")
            Issue.record("expected throw")
        } catch let error as ExpressionError {
            #expect(error.phase == .lex)
            #expect(error.offset == 3)
        } catch {
            Issue.record("wrong error type: \(error)")
        }
    }

    // MARK: - A realistic expression

    @Test("A full expression tokenizes")
    func fullExpression() throws {
        let toks = try kinds("input.age >= 18 and user.role == 'admin'")
        #expect(toks == [
            .identifier("input"), .dot, .identifier("age"), .gte, .int(18),
            .kwAnd,
            .identifier("user"), .dot, .identifier("role"), .eq, .string("admin"),
        ])
    }
}
