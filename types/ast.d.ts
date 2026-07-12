import type { JinjaValue } from "./value.ts";
export type TokenKind = {
    t: "int";
    value: number;
} | {
    t: "double";
    value: number;
} | {
    t: "string";
    value: string;
} | {
    t: "identifier";
    value: string;
} | {
    t: "kwTrue";
} | {
    t: "kwFalse";
} | {
    t: "kwNull";
} | {
    t: "kwAnd";
} | {
    t: "kwOr";
} | {
    t: "kwNot";
} | {
    t: "kwIn";
} | {
    t: "kwIf";
} | {
    t: "kwElse";
} | {
    t: "lparen";
} | {
    t: "rparen";
} | {
    t: "lbracket";
} | {
    t: "rbracket";
} | {
    t: "lbrace";
} | {
    t: "rbrace";
} | {
    t: "comma";
} | {
    t: "colon";
} | {
    t: "dot";
} | {
    t: "pipe";
} | {
    t: "eq";
} | {
    t: "neq";
} | {
    t: "lt";
} | {
    t: "lte";
} | {
    t: "gt";
} | {
    t: "gte";
} | {
    t: "plus";
} | {
    t: "minus";
} | {
    t: "star";
} | {
    t: "slash";
} | {
    t: "slashSlash";
} | {
    t: "percent";
} | {
    t: "tilde";
} | {
    t: "eof";
};
export interface Token {
    readonly kind: TokenKind;
    /** Character offset of the token's first character in the source. */
    readonly offset: number;
}
/** Structural equality of two token kinds (for parser lookahead / tests). */
export declare function tokenKindEquals(a: TokenKind, b: TokenKind): boolean;
/** Human-readable description for parser error messages (mirrors Swift). */
export declare function tokenDescription(k: TokenKind): string;
export type UnaryOperator = "not" | "negate";
export type LogicalOperator = "and" | "or";
export type BinaryOperator = "==" | "!=" | "<" | "<=" | ">" | ">=" | "+" | "-" | "*" | "/" | "//" | "%" | "~" | "in" | "not in";
export type PathSegment = {
    s: "key";
    name: string;
} | {
    s: "index";
    index: number;
} | {
    s: "dynamic";
    expr: Expr;
};
export interface ObjectEntry {
    readonly key: string;
    readonly value: Expr;
}
export type Expr = {
    e: "literal";
    value: JinjaValue;
} | {
    e: "reference";
    segments: PathSegment[];
} | {
    e: "unary";
    op: UnaryOperator;
    operand: Expr;
} | {
    e: "binary";
    op: BinaryOperator;
    lhs: Expr;
    rhs: Expr;
} | {
    e: "logical";
    op: LogicalOperator;
    operands: Expr[];
} | {
    e: "conditional";
    condition: Expr;
    then: Expr;
    otherwise: Expr;
} | {
    e: "filter";
    name: string;
    input: Expr;
    arguments: Expr[];
} | {
    e: "arrayLiteral";
    elements: Expr[];
} | {
    e: "objectLiteral";
    entries: ObjectEntry[];
};
