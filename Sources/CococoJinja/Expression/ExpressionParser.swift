import Foundation

/// Bounded, bare-expression parsing for hosts that need a reusable typed AST.
/// Does not evaluate, render a template or resolve host data.
public enum ExpressionParser {
    public struct Limits: Sendable {
        public var maxSourceBytes: Int
        public var maxDepth: Int
        public var maxNodes: Int
        public var maxTokens: Int
        public init(maxSourceBytes: Int = 2048, maxDepth: Int = 32, maxNodes: Int = 512, maxTokens: Int = 2048) {
            self.maxSourceBytes = maxSourceBytes; self.maxDepth = maxDepth
            self.maxNodes = maxNodes; self.maxTokens = maxTokens
        }
    }
    public static func parse(_ source: String, limits: Limits = Limits()) throws -> Expr {
        guard limits.maxSourceBytes > 0, limits.maxDepth > 0, limits.maxNodes > 0, limits.maxTokens > 0 else {
            throw ExpressionError.parse("parse limits must be positive", at: 0)
        }
        guard source.utf8.count <= limits.maxSourceBytes else { throw ExpressionError.parse("expression source size exceeded", at: 0) }
        let tokens = try Lexer.tokenize(source)
        guard tokens.count <= limits.maxTokens else { throw ExpressionError.parse("expression token count exceeded", at: 0) }
        let ast = try Parser.parse(tokens, maxDepth: limits.maxDepth)
        var stack: [(Expr, Int)] = [(ast, 1)], count = 0
        while let (node, depth) = stack.popLast() {
            count += 1
            guard count <= limits.maxNodes, depth <= limits.maxDepth else { throw ExpressionError.parse("expression AST budget exceeded", at: 0) }
            let children: [Expr]
            switch node {
            case .literal: children = []
            case .reference(let segments):
                count += segments.count
                children = segments.compactMap { if case .dynamic(let expression) = $0 { return expression }; return nil }
            case .unary(_, let operand): children = [operand]
            case .binary(_, let lhs, let rhs): children = [lhs, rhs]
            case .logical(_, let operands), .arrayLiteral(let operands): children = operands
            case .conditional(let condition, let yes, let no): children = [condition, yes, no]
            case .filter(_, let input, let arguments): children = [input] + arguments
            case .objectLiteral(let entries): children = entries.map(\.value)
            }
            guard count <= limits.maxNodes else { throw ExpressionError.parse("expression AST budget exceeded", at: 0) }
            stack.append(contentsOf: children.map { ($0, depth + 1) })
        }
        return ast
    }
}
