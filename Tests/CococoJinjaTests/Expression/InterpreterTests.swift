//
//  InterpreterTests.swift
//  CococoJinjaTests
//
//  Copyright Triple C Labs GmbH
//

import Foundation
import Testing

@testable import CococoJinja

@Suite("Expression interpreter")
struct InterpreterTests {

    // A representative context: { input, variables, nodes } with nodes wrapped
    // as { output: ... } and indexed by both id and friendly name.
    private static let context: JinjaValue = .object([
        "input": .object([
            "age": .int(25),
            "name": .string("Ada"),
            "tags": .array([.string("a"), .string("b")]),
            "score": .double(9.5),
        ]),
        "variables": .object([
            "threshold": .int(18),
        ]),
        "nodes": .object([
            "n1": .object(["output": .object(["value": .int(42), "ok": .bool(true)])]),
            "classifier": .object(["output": .object(["label": .string("spam")])]),
        ]),
    ])

    private func eval(
        _ source: String,
        filters: FilterRegistry = FilterRegistry(),
        limits: ExpressionLimits = .standard
    ) throws -> JinjaValue {
        let ast = try Parser.parse(source: source)
        return try Evaluator.evaluate(ast, context: Self.context, filters: filters, limits: limits)
    }

    // MARK: - References

    @Test("Input, variable, and node references")
    func references() throws {
        #expect(try eval("input.age") == .int(25))
        #expect(try eval("input.name") == .string("Ada"))
        #expect(try eval("variables.threshold") == .int(18))
        #expect(try eval("nodes.n1.output.value") == .int(42))
        #expect(try eval("nodes.classifier.output.label") == .string("spam"))
    }

    @Test("Missing references resolve to null, not an error")
    func missingReferences() throws {
        #expect(try eval("input.missing") == .null)
        #expect(try eval("nodes.nope.output.value") == .null)
        #expect(try eval("input.age.deeper") == .null) // navigating into a scalar
        #expect(try eval("totallyUnknownRoot") == .null)
    }

    @Test("Index and dynamic subscripts")
    func subscripts() throws {
        #expect(try eval("input.tags[0]") == .string("a"))
        #expect(try eval("input.tags[1]") == .string("b"))
        #expect(try eval("input.tags[5]") == .null) // out of range
    }

    // MARK: - Equality & comparison

    @Test("Equality uses semantic rules")
    func equality() throws {
        #expect(try eval("input.age == 25") == .bool(true))
        #expect(try eval("input.age == 25.0") == .bool(true)) // numeric eq
        #expect(try eval("input.age != 30") == .bool(true))
        #expect(try eval("input.name == 'Ada'") == .bool(true))
    }

    @Test("Ordered comparison produces booleans")
    func comparison() throws {
        #expect(try eval("input.age >= variables.threshold") == .bool(true))
        #expect(try eval("input.age < 18") == .bool(false))
        #expect(try eval("input.score > 9") == .bool(true))
    }

    @Test("Comparison of non-orderable types throws")
    func comparisonThrows() {
        #expect(throws: ExpressionError.self) { _ = try eval("input.name < 5") }
    }

    // MARK: - Logical

    @Test("Logical and/or return booleans and short-circuit")
    func logical() throws {
        #expect(try eval("input.age >= 18 and input.name == 'Ada'") == .bool(true))
        #expect(try eval("input.age < 18 or input.score > 9") == .bool(true))
        // Right side would throw (division by zero) if evaluated, so a passing
        // result proves the `and` short-circuited on the false left operand.
        #expect(try eval("input.age < 18 and 1 / 0 > 0") == .bool(false))
        #expect(try eval("not (input.age < 18)") == .bool(true))
    }

    // MARK: - Arithmetic

    @Test("Integer arithmetic stays integer")
    func intArithmetic() throws {
        #expect(try eval("2 + 3") == .int(5))
        #expect(try eval("10 - 4") == .int(6))
        #expect(try eval("6 * 7") == .int(42))
        #expect(try eval("7 // 2") == .int(3))
        #expect(try eval("7 % 3") == .int(1))
    }

    @Test("True division always yields double")
    func trueDivision() throws {
        #expect(try eval("7 / 2") == .double(3.5))
        #expect(try eval("4 / 2") == .double(2.0))
    }

    @Test("Mixed numeric arithmetic promotes to double")
    func mixedArithmetic() throws {
        #expect(try eval("2 + 1.5") == .double(3.5))
        #expect(try eval("input.score * 2") == .double(19.0))
    }

    @Test("Floor division rounds toward negative infinity")
    func floorDivision() throws {
        #expect(try eval("-7 // 2") == .int(-4))
    }

    @Test("Division by zero throws")
    func divisionByZero() {
        #expect(throws: ExpressionError.self) { _ = try eval("1 / 0") }
        #expect(throws: ExpressionError.self) { _ = try eval("1 // 0") }
        #expect(throws: ExpressionError.self) { _ = try eval("1 % 0") }
    }

    @Test("Arithmetic on non-numbers throws")
    func arithmeticTypeError() {
        #expect(throws: ExpressionError.self) { _ = try eval("'a' + 1") }
    }

    // MARK: - Concat & negate

    @Test("Concat coerces operands to strings")
    func concat() throws {
        #expect(try eval("'Hello, ' ~ input.name") == .string("Hello, Ada"))
        #expect(try eval("'n=' ~ input.age") == .string("n=25"))
        #expect(try eval("input.age ~ '/' ~ 100") == .string("25/100"))
    }

    @Test("Unary negate on numbers; error otherwise")
    func negate() throws {
        #expect(try eval("-input.age") == .int(-25))
        #expect(throws: ExpressionError.self) { _ = try eval("-input.name") }
    }

    // MARK: - Membership

    @Test("Membership over arrays, objects, strings")
    func membership() throws {
        #expect(try eval("'a' in input.tags") == .bool(true))
        #expect(try eval("'z' in input.tags") == .bool(false))
        #expect(try eval("'z' not in input.tags") == .bool(true))
        #expect(try eval("'age' in input") == .bool(true)) // object key membership
        #expect(try eval("'Ad' in input.name") == .bool(true)) // substring
    }

    @Test("Membership on unsupported collection throws")
    func membershipThrows() {
        #expect(throws: ExpressionError.self) { _ = try eval("1 in input.age") }
    }

    // MARK: - Ternary

    @Test("Ternary chooses a branch and preserves its type")
    func ternary() throws {
        #expect(try eval("'adult' if input.age >= 18 else 'minor'") == .string("adult"))
        #expect(try eval("input.age if input.age >= 18 else 0") == .int(25))
    }

    // MARK: - Collection literals

    @Test("Array and object literals evaluate their elements")
    func collectionLiterals() throws {
        #expect(try eval("[1, input.age, 3]") == .array([.int(1), .int(25), .int(3)]))
        #expect(try eval("{ id: input.age, label: input.name }")
            == .object(["id": .int(25), "label": .string("Ada")]))
    }

    // MARK: - Filters

    @Test("Filter dispatch with a registered filter")
    func filterDispatch() throws {
        let registry = FilterRegistry([
            "double": { input, _ in
                guard let i = input.intValue else { throw ExpressionError.evaluate("double expects int") }
                return .int(i * 2)
            },
            "suffix": { input, args in
                .string((input.stringValue ?? "") + (args.first?.stringValue ?? ""))
            },
        ])
        #expect(try eval("input.age | double", filters: registry) == .int(50))
        #expect(try eval("input.name | suffix('!')", filters: registry) == .string("Ada!"))
    }

    @Test("Unknown filter throws")
    func unknownFilter() {
        #expect(throws: ExpressionError.self) { _ = try eval("input.age | nope") }
    }

    // MARK: - Execution budget

    @Test("maxOperations is enforced")
    func maxOperations() {
        let tight = ExpressionLimits(maxOperations: 3)
        #expect(throws: ExpressionError.self) { _ = try eval("1 + 2 + 3 + 4 + 5", limits: tight) }
    }

    @Test("maxDepth is enforced")
    func maxDepth() {
        let shallow = ExpressionLimits(maxDepth: 1)
        // 1 + (2 * 3) nests operands beyond depth 1.
        #expect(throws: ExpressionError.self) { _ = try eval("1 + 2 * 3", limits: shallow) }
    }

    @Test("maxCollectionSize is enforced")
    func maxCollectionSize() {
        let tiny = ExpressionLimits(maxCollectionSize: 2)
        #expect(throws: ExpressionError.self) { _ = try eval("[1, 2, 3]", limits: tiny) }
    }

    @Test("maxStringLength is enforced for concat")
    func maxStringLength() {
        let tiny = ExpressionLimits(maxStringLength: 3)
        #expect(throws: ExpressionError.self) { _ = try eval("'ab' ~ 'cd'", limits: tiny) }
    }
}
