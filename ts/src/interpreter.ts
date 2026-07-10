// interpreter.ts — port of Expression/Interpreter.swift
//
// Tree-walk evaluator: Expr + context -> JinjaValue, bounded by ExpressionLimits.
// Reference evaluation is plain navigation (missing → null). Logical operators
// return booleans (not Python operand values), matching the dialect design.

import type { BinaryOperator, Expr, LogicalOperator, PathSegment, UnaryOperator } from "./ast.ts";
import { ExpressionError } from "./errors.ts";
import { FilterRegistry } from "./filters.ts";
import { type ExpressionLimits, standardLimits } from "./limits.ts";
import {
	asDouble,
	intInRange,
	isNumeric,
	isTruthy,
	type JinjaValue,
	JV,
	orderedAscending,
	orderedDescending,
	renderedString,
	semanticCompare,
	semanticEquals,
	typeName,
} from "./value.ts";

/** Evaluate `expr` against `context`, using `filters` and bounded by `limits`. */
export function evaluateExpr(
	expr: Expr,
	context: JinjaValue,
	filters: FilterRegistry = new FilterRegistry(),
	limits: ExpressionLimits = standardLimits,
): JinjaValue {
	return new Run(context, filters, limits).eval(expr, 0);
}

class Run {
	private operations = 0;

	constructor(
		private context: JinjaValue,
		private filters: FilterRegistry,
		private limits: ExpressionLimits,
	) {}

	eval(expr: Expr, depth: number): JinjaValue {
		if (depth > this.limits.maxDepth) {
			throw ExpressionError.evaluate(
				`expression nesting exceeds limit (${this.limits.maxDepth})`,
			);
		}
		this.operations += 1;
		if (this.operations > this.limits.maxOperations) {
			throw ExpressionError.evaluate(
				`expression evaluation budget exceeded (${this.limits.maxOperations} steps)`,
			);
		}

		switch (expr.e) {
			case "literal":
				return expr.value;
			case "reference":
				return this.resolveReference(expr.segments, depth);
			case "unary":
				return this.evalUnary(expr.op, expr.operand, depth);
			case "binary":
				return this.evalBinary(expr.op, expr.lhs, expr.rhs, depth);
			case "logical":
				return this.evalLogical(expr.op, expr.operands, depth);
			case "conditional": {
				const chosen = isTruthy(this.eval(expr.condition, depth + 1))
					? expr.then
					: expr.otherwise;
				return this.eval(chosen, depth + 1);
			}
			case "filter":
				return this.evalFilter(expr.name, expr.input, expr.arguments, depth);
			case "arrayLiteral": {
				this.checkCollectionSize(expr.elements.length);
				return JV.array(expr.elements.map((el) => this.eval(el, depth + 1)));
			}
			case "objectLiteral": {
				this.checkCollectionSize(expr.entries.length);
				const dict = new Map<string, JinjaValue>();
				for (const entry of expr.entries) {
					dict.set(entry.key, this.eval(entry.value, depth + 1));
				}
				return { kind: "object", value: dict };
			}
		}
	}

	// MARK: References

	private resolveReference(segments: PathSegment[], depth: number): JinjaValue {
		let current = this.context;
		for (const segment of segments) {
			if (current.kind === "null") return JV.null; // short-circuit
			switch (segment.s) {
				case "key":
					current = memberByKey(current, segment.name) ?? JV.null;
					break;
				case "index":
					current = memberByIndex(current, segment.index) ?? JV.null;
					break;
				case "dynamic": {
					const key = this.eval(segment.expr, depth + 1);
					if (key.kind === "string") {
						current = memberByKey(current, key.value) ?? JV.null;
					} else if (key.kind === "int") {
						current = memberByIndex(current, key.value) ?? JV.null;
					} else {
						throw ExpressionError.evaluate(
							`subscript must be a string or integer, got ${typeName(key)}`,
						);
					}
					break;
				}
			}
		}
		return current;
	}

	// MARK: Unary

	private evalUnary(op: UnaryOperator, operand: Expr, depth: number): JinjaValue {
		const value = this.eval(operand, depth + 1);
		switch (op) {
			case "not":
				return JV.bool(!isTruthy(value));
			case "negate":
				if (value.kind === "int") {
					const negated = -value.value;
					if (!intInRange(negated)) {
						throw ExpressionError.evaluate(`integer overflow negating ${value.value}`);
					}
					return JV.int(negated);
				}
				if (value.kind === "double") return JV.double(-value.value);
				throw ExpressionError.evaluate(`cannot negate ${typeName(value)}`);
		}
	}

	// MARK: Logical (boolean, short-circuiting)

	private evalLogical(op: LogicalOperator, operands: Expr[], depth: number): JinjaValue {
		if (op === "and") {
			for (const operand of operands) {
				if (!isTruthy(this.eval(operand, depth + 1))) return JV.bool(false);
			}
			return JV.bool(true);
		}
		// or
		for (const operand of operands) {
			if (isTruthy(this.eval(operand, depth + 1))) return JV.bool(true);
		}
		return JV.bool(false);
	}

	// MARK: Binary

	private evalBinary(op: BinaryOperator, lhsExpr: Expr, rhsExpr: Expr, depth: number): JinjaValue {
		const lhs = this.eval(lhsExpr, depth + 1);
		const rhs = this.eval(rhsExpr, depth + 1);

		switch (op) {
			case "==":
				return JV.bool(semanticEquals(lhs, rhs));
			case "!=":
				return JV.bool(!semanticEquals(lhs, rhs));
			case "<":
				return JV.bool(semanticCompare(lhs, rhs) === orderedAscending);
			case "<=":
				return JV.bool(semanticCompare(lhs, rhs) !== orderedDescending);
			case ">":
				return JV.bool(semanticCompare(lhs, rhs) === orderedDescending);
			case ">=":
				return JV.bool(semanticCompare(lhs, rhs) !== orderedAscending);
			case "+":
			case "-":
			case "*":
			case "/":
			case "//":
			case "%":
				return this.arithmetic(op, lhs, rhs);
			case "~":
				return this.concat(lhs, rhs);
			case "in":
				return JV.bool(this.membership(lhs, rhs));
			case "not in":
				return JV.bool(!this.membership(lhs, rhs));
		}
	}

	private arithmetic(op: BinaryOperator, lhs: JinjaValue, rhs: JinjaValue): JinjaValue {
		if (!isNumeric(lhs) || !isNumeric(rhs)) {
			throw ExpressionError.evaluate(
				`operator '${op}' requires two numbers, got ${typeName(lhs)} and ${typeName(rhs)}`,
			);
		}
		// Integer fast path keeps ints as ints (except true division).
		if (lhs.kind === "int" && rhs.kind === "int") {
			const a = lhs.value;
			const b = rhs.value;
			switch (op) {
				case "+":
					return intResult(a + b, () => `integer overflow in ${a} + ${b}`);
				case "-":
					return intResult(a - b, () => `integer overflow in ${a} - ${b}`);
				case "*":
					return intResult(a * b, () => `integer overflow in ${a} * ${b}`);
				case "/":
					if (b === 0) throw ExpressionError.evaluate("division by zero");
					return JV.double(a / b);
				case "//": {
					if (b === 0) throw ExpressionError.evaluate("division by zero");
					return JV.int(Math.floor(a / b));
				}
				case "%": {
					if (b === 0) throw ExpressionError.evaluate("division by zero");
					if (b === -1) return JV.int(0);
					// Floored modulo (sign follows divisor), matching Python/Jinja and
					// Swift's implementation.
					const r = a % b;
					const floored = r !== 0 && r < 0 !== b < 0 ? r + b : r;
					return JV.int(floored);
				}
			}
		}
		const a = asDouble(lhs)!;
		const b = asDouble(rhs)!;
		switch (op) {
			case "+":
				return JV.double(a + b);
			case "-":
				return JV.double(a - b);
			case "*":
				return JV.double(a * b);
			case "/":
				if (b === 0) throw ExpressionError.evaluate("division by zero");
				return JV.double(a / b);
			case "//":
				if (b === 0) throw ExpressionError.evaluate("division by zero");
				return JV.double(Math.floor(a / b));
			case "%": {
				if (b === 0) throw ExpressionError.evaluate("division by zero");
				// Swift's truncatingRemainder — sign follows the dividend.
				return JV.double(truncatingRemainder(a, b));
			}
			default:
				throw ExpressionError.evaluate("unsupported arithmetic operator");
		}
	}

	private concat(lhs: JinjaValue, rhs: JinjaValue): JinjaValue {
		const result = renderedString(lhs) + renderedString(rhs);
		if (charCount(result) > this.limits.maxStringLength) {
			throw ExpressionError.evaluate(
				`string length exceeds limit (${this.limits.maxStringLength})`,
			);
		}
		return JV.string(result);
	}

	private membership(element: JinjaValue, collection: JinjaValue): boolean {
		switch (collection.kind) {
			case "array":
				return collection.value.some((item) => semanticEquals(item, element));
			case "object":
				if (element.kind !== "string") {
					throw ExpressionError.evaluate(
						`'in' on an object requires a string key, got ${typeName(element)}`,
					);
				}
				return collection.value.has(element.value);
			case "string":
				if (element.kind !== "string") {
					throw ExpressionError.evaluate(
						`'in' on a string requires a string, got ${typeName(element)}`,
					);
				}
				return collection.value.includes(element.value) || element.value.length === 0;
			default:
				throw ExpressionError.evaluate(
					`'in' requires an array, object, or string, got ${typeName(collection)}`,
				);
		}
	}

	// MARK: Filters

	private evalFilter(name: string, inputExpr: Expr, argExprs: Expr[], depth: number): JinjaValue {
		const filter = this.filters.filter(name);
		if (filter === undefined) {
			throw ExpressionError.evaluate(`unknown filter '${name}'`);
		}
		const input = this.eval(inputExpr, depth + 1);
		const args = argExprs.map((a) => this.eval(a, depth + 1));
		const result = filter(input, args);
		this.checkValueSize(result);
		return result;
	}

	// MARK: Budget helpers

	private checkCollectionSize(count: number): void {
		if (count > this.limits.maxCollectionSize) {
			throw ExpressionError.evaluate(
				`collection size exceeds limit (${this.limits.maxCollectionSize})`,
			);
		}
	}

	private checkValueSize(value: JinjaValue): void {
		switch (value.kind) {
			case "string":
				if (charCount(value.value) > this.limits.maxStringLength) {
					throw ExpressionError.evaluate(
						`string length exceeds limit (${this.limits.maxStringLength})`,
					);
				}
				break;
			case "array":
				this.checkCollectionSize(value.value.length);
				break;
			case "object":
				this.checkCollectionSize(value.value.size);
				break;
			default:
				break;
		}
	}
}

// MARK: - Member access helpers (mirror JinjaValue's subscripts)

function memberByKey(v: JinjaValue, key: string): JinjaValue | undefined {
	if (v.kind !== "object") return undefined;
	return v.value.get(key);
}

function memberByIndex(v: JinjaValue, index: number): JinjaValue | undefined {
	if (v.kind !== "array") return undefined;
	if (index < 0 || index >= v.value.length) return undefined;
	return v.value[index];
}

function intResult(x: number, overflowMessage: () => string): JinjaValue {
	if (!intInRange(x)) throw ExpressionError.evaluate(overflowMessage());
	return JV.int(x);
}

/** Swift's Double.truncatingRemainder(dividingBy:) — sign follows the dividend. */
function truncatingRemainder(a: number, b: number): number {
	return a - Math.trunc(a / b) * b;
}

/** Count of characters (code points), matching Swift's String.count for these inputs. */
function charCount(s: string): number {
	return Array.from(s).length;
}
