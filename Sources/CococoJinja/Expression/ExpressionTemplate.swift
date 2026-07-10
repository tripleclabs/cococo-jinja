//
//  ExpressionTemplate.swift
//  CococoJinja
//
//  Copyright Triple C Labs GmbH
//
//  The dialect's front door. Splits a source string into plaintext and `{{ }}`
//  expression spans, then applies the smart-evaluation contract (§6):
//
//    - A source that is a single `{{ expr }}` span (modulo surrounding
//      whitespace) evaluates to its **typed** JinjaValue.
//    - Anything else — plaintext, multiple spans, or mixed text — renders to a
//      **string**.
//
//  This single entry point replaces both JSONLogicEvaluator (conditions, via
//  `{{ ... }}`) and TemplateRenderer (text interpolation).
//

import Foundation

public enum ExpressionTemplate {

    // MARK: - Public API

    /// Smart evaluation: typed value for a single expression span, else a string.
    public static func evaluate(
        _ source: String,
        context: JinjaValue,
        filters: FilterRegistry = .standard,
        limits: ExpressionLimits = .standard
    ) throws -> JinjaValue {
        let segments = try scan(source)
        if let expr = soleExpression(in: segments) {
            return try Evaluator.evaluate(expr, context: context, filters: filters, limits: limits)
        }
        return .string(try renderSegments(segments, context: context, filters: filters, limits: limits))
    }

    /// Always render to a string (the explicit text projection).
    public static func render(
        _ source: String,
        context: JinjaValue,
        filters: FilterRegistry = .standard,
        limits: ExpressionLimits = .standard
    ) throws -> String {
        try renderSegments(try scan(source), context: context, filters: filters, limits: limits)
    }

    /// The parsed expression if `source` is a single `{{ expr }}` span (modulo
    /// surrounding whitespace); `nil` for plaintext / mixed / multi-span sources.
    /// Used by the rule-subset/builder layer to recover the AST from a stored
    /// condition string. Throws only on a malformed expression span.
    public static func singleExpression(in source: String) throws -> Expr? {
        soleExpression(in: try scan(source))
    }

    // MARK: - Segments

    enum Segment: Equatable {
        case text(String)
        case expression(Expr)
    }

    /// True if `segments` is exactly one expression plus only whitespace text.
    private static func soleExpression(in segments: [Segment]) -> Expr? {
        var found: Expr?
        for segment in segments {
            switch segment {
            case let .text(t):
                if !t.allSatisfy(\.isWhitespace) { return nil }
            case let .expression(e):
                if found != nil { return nil } // more than one expression
                found = e
            }
        }
        return found
    }

    private static func renderSegments(
        _ segments: [Segment],
        context: JinjaValue,
        filters: FilterRegistry,
        limits: ExpressionLimits
    ) throws -> String {
        var out = ""
        for segment in segments {
            switch segment {
            case let .text(t):
                out += t
            case let .expression(e):
                out += try Evaluator.evaluate(e, context: context, filters: filters, limits: limits).renderedString()
            }
            if out.count > limits.maxStringLength {
                throw ExpressionError.evaluate("rendered output exceeds limit (\(limits.maxStringLength))")
            }
        }
        return out
    }

    // MARK: - Scanner (text vs `{{ }}` spans)

    static func scan(_ source: String) throws -> [Segment] {
        let chars = Array(source)
        var segments: [Segment] = []
        var textStart = 0
        var i = 0

        func flushText(upTo end: Int) {
            if end > textStart {
                segments.append(.text(String(chars[textStart..<end])))
            }
        }

        while i < chars.count {
            if chars[i] == "{", i + 1 < chars.count, chars[i + 1] == "{" {
                let openAt = i
                flushText(upTo: openAt)
                // Find the closing `}}`, skipping any `}}` that appears inside a
                // quoted string literal (e.g. `{{ '}}' }}`).
                var j = i + 2
                var quote: Character?
                while j < chars.count {
                    let c = chars[j]
                    if let q = quote {
                        if c == "\\" {
                            j += 2 // skip the escaped character
                            continue
                        }
                        if c == q { quote = nil }
                        j += 1
                    } else if c == "'" || c == "\"" {
                        quote = c
                        j += 1
                    } else if c == "}", j + 1 < chars.count, chars[j + 1] == "}" {
                        break
                    } else {
                        j += 1
                    }
                }
                guard j + 1 < chars.count, chars[j] == "}", chars[j + 1] == "}" else {
                    throw ExpressionError.parse("unterminated '{{' expression span", at: openAt)
                }
                let exprSource = String(chars[(openAt + 2)..<j])
                let expr = try parseSpan(exprSource, baseOffset: openAt + 2)
                segments.append(.expression(expr))
                i = j + 2
                textStart = i
            } else {
                i += 1
            }
        }
        flushText(upTo: chars.count)
        return segments
    }

    /// Parse one expression span, rebasing any error offset onto the full source.
    private static func parseSpan(_ exprSource: String, baseOffset: Int) throws -> Expr {
        do {
            return try Parser.parse(source: exprSource)
        } catch let error as ExpressionError {
            throw ExpressionError(
                phase: error.phase,
                message: error.message,
                offset: error.offset.map { $0 + baseOffset }
            )
        }
    }
}
