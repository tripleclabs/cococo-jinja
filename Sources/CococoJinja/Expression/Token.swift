//
//  Token.swift
//  CococoJinja
//
//  Copyright Triple C Labs GmbH
//

import Foundation

/// A lexical token produced by `Lexer` from an expression source string.
struct Token: Equatable, Sendable {
    let kind: TokenKind
    /// Byte/character offset of the token's first character in the source.
    let offset: Int

    init(_ kind: TokenKind, at offset: Int) {
        self.kind = kind
        self.offset = offset
    }
}

/// The kinds of token in the expression dialect.
///
/// Deliberately small: no statement/block tags, no comments — see
/// docs/workflow-expression-dialect.md §4.
enum TokenKind: Equatable, Sendable {
    // Literals
    case int(Int)
    case double(Double)
    case string(String)

    // Identifiers & keywords
    case identifier(String)
    case kwTrue
    case kwFalse
    case kwNull // `null` and `none` both lex to this
    case kwAnd
    case kwOr
    case kwNot
    case kwIn
    case kwIf
    case kwElse

    // Grouping / punctuation
    case lparen      // (
    case rparen      // )
    case lbracket    // [
    case rbracket    // ]
    case lbrace      // {
    case rbrace      // }
    case comma       // ,
    case colon       // :
    case dot         // .
    case pipe        // |

    // Operators
    case eq          // ==
    case neq         // !=
    case lt          // <
    case lte         // <=
    case gt          // >
    case gte         // >=
    case plus        // +
    case minus       // -
    case star        // *
    case slash       // /
    case slashSlash  // //
    case percent     // %
    case tilde       // ~

    case eof

    /// Human-readable description for parser error messages.
    var description: String {
        switch self {
        case let .int(v): "integer \(v)"
        case let .double(v): "number \(v)"
        case let .string(v): "string \"\(v)\""
        case let .identifier(v): "identifier '\(v)'"
        case .kwTrue: "'true'"
        case .kwFalse: "'false'"
        case .kwNull: "'null'"
        case .kwAnd: "'and'"
        case .kwOr: "'or'"
        case .kwNot: "'not'"
        case .kwIn: "'in'"
        case .kwIf: "'if'"
        case .kwElse: "'else'"
        case .lparen: "'('"
        case .rparen: "')'"
        case .lbracket: "'['"
        case .rbracket: "']'"
        case .lbrace: "'{'"
        case .rbrace: "'}'"
        case .comma: "','"
        case .colon: "':'"
        case .dot: "'.'"
        case .pipe: "'|'"
        case .eq: "'=='"
        case .neq: "'!='"
        case .lt: "'<'"
        case .lte: "'<='"
        case .gt: "'>'"
        case .gte: "'>='"
        case .plus: "'+'"
        case .minus: "'-'"
        case .star: "'*'"
        case .slash: "'/'"
        case .slashSlash: "'//'"
        case .percent: "'%'"
        case .tilde: "'~'"
        case .eof: "end of input"
        }
    }
}
