// filters.ts — port of Expression/FilterRegistry.swift and Expression/Filters.swift
//
// The standard filter allowlist — the entire callable surface of the dialect.
// Each filter is type-checked and throws a typed ExpressionError on misuse.

import { ExpressionError } from "./errors.ts";
import {
	asDouble,
	type JinjaValue,
	JV,
	orderedAscending,
	orderedDescending,
	renderedString,
	semanticCompare,
	typeName,
} from "./value.ts";

export type ExpressionFilter = (input: JinjaValue, args: JinjaValue[]) => JinjaValue;

// MARK: - Argument helpers (function declarations — hoisted)

function requireArgs(args: JinjaValue[], count: number, name: string): void {
	if (args.length !== count) {
		throw ExpressionError.evaluate(
			`filter '${name}' expects ${count} argument(s), got ${args.length}`,
		);
	}
}

function requireString(value: JinjaValue, name: string): string {
	if (value.kind !== "string") {
		throw ExpressionError.evaluate(`filter '${name}' requires a string, got ${typeName(value)}`);
	}
	return value.value;
}

function requireObject(value: JinjaValue, name: string): Map<string, JinjaValue> {
	if (value.kind !== "object") {
		throw ExpressionError.evaluate(`filter '${name}' requires an object, got ${typeName(value)}`);
	}
	return value.value;
}

function requireKeyArgs(args: JinjaValue[], name: string): string[] {
	return args.map((a) => requireString(a, name));
}

function extreme(input: JinjaValue, name: string, wanted: number): JinjaValue {
	if (input.kind !== "array") {
		throw ExpressionError.evaluate(`filter '${name}' requires an array, got ${typeName(input)}`);
	}
	if (input.value.length === 0) {
		throw ExpressionError.evaluate(`filter '${name}' requires a non-empty array`);
	}
	let best = input.value[0]!;
	for (let i = 1; i < input.value.length; i++) {
		const item = input.value[i]!;
		if (semanticCompare(item, best) === wanted) best = item;
	}
	return best;
}

function roundHalfAwayFromZero(x: number): number {
	return x < 0 ? -Math.round(-x) : Math.round(x);
}

// MARK: - The standard filters

export const standardFilters: Record<string, ExpressionFilter> = {
	/** `value | default(fallback)` — fallback when the input is null. */
	default(input, args) {
		requireArgs(args, 1, "default");
		if (input.kind === "null") return args[0]!;
		return input;
	},

	/** `value | length` — element/character count of array, object, or string. */
	length(input, args) {
		requireArgs(args, 0, "length");
		switch (input.kind) {
			case "array":
				return JV.int(input.value.length);
			case "object":
				return JV.int(input.value.size);
			case "string":
				// Swift's String.count counts grapheme clusters; for the ASCII/BMP
				// inputs the dialect handles, code-point length agrees. Array.from
				// counts code points (closer to Swift than `.length`'s UTF-16 units).
				return JV.int(Array.from(input.value).length);
			default:
				throw ExpressionError.evaluate(
					`filter 'length' requires an array, object, or string, got ${typeName(input)}`,
				);
		}
	},

	/** `array | min`. */
	min(input, args) {
		requireArgs(args, 0, "min");
		return extreme(input, "min", orderedAscending);
	},

	/** `array | max`. */
	max(input, args) {
		requireArgs(args, 0, "max");
		return extreme(input, "max", orderedDescending);
	},

	lower(input, args) {
		requireArgs(args, 0, "lower");
		return JV.string(requireString(input, "lower").toLowerCase());
	},
	upper(input, args) {
		requireArgs(args, 0, "upper");
		return JV.string(requireString(input, "upper").toUpperCase());
	},
	trim(input, args) {
		requireArgs(args, 0, "trim");
		// Swift trims whitespacesAndNewlines; JS String.trim removes the same set
		// of ASCII/Unicode whitespace plus line terminators.
		return JV.string(requireString(input, "trim").trim());
	},

	/** `array | join(sep)` — render elements to strings and join (default ""). */
	join(input, args) {
		if (input.kind !== "array") {
			throw ExpressionError.evaluate(`filter 'join' requires an array, got ${typeName(input)}`);
		}
		let sep: string;
		if (args.length === 0) sep = "";
		else if (args.length === 1) sep = requireString(args[0]!, "join");
		else {
			throw ExpressionError.evaluate(
				`filter 'join' expects 0 or 1 argument(s), got ${args.length}`,
			);
		}
		return JV.string(input.value.map(renderedString).join(sep));
	},

	/** `number | abs`. */
	abs(input, args) {
		requireArgs(args, 0, "abs");
		if (input.kind === "int") return JV.int(Math.abs(input.value));
		if (input.kind === "double") return JV.double(Math.abs(input.value));
		throw ExpressionError.evaluate(`filter 'abs' requires a number, got ${typeName(input)}`);
	},

	/** `number | round(ndigits=0)` — returns a double (Jinja semantics). */
	round(input, args) {
		const value = asDouble(input);
		if (value === undefined) {
			throw ExpressionError.evaluate(`filter 'round' requires a number, got ${typeName(input)}`);
		}
		let digits: number;
		if (args.length === 0) digits = 0;
		else if (args.length === 1) {
			const a = args[0]!;
			if (a.kind !== "int") {
				throw ExpressionError.evaluate("filter 'round' precision must be an integer");
			}
			digits = a.value;
		} else {
			throw ExpressionError.evaluate(
				`filter 'round' expects 0 or 1 argument(s), got ${args.length}`,
			);
		}
		const factor = Math.pow(10, digits);
		// Swift's Double.rounded() is round-half-away-from-zero; match it.
		return JV.double(roundHalfAwayFromZero(value * factor) / factor);
	},

	/** `object | merge(other)` — shallow merge; keys in `other` win. */
	merge(input, args) {
		requireArgs(args, 1, "merge");
		const base = new Map(requireObject(input, "merge"));
		const other = requireObject(args[0]!, "merge");
		for (const [k, v] of other) base.set(k, v);
		return { kind: "object", value: base };
	},

	/** `object | pick('a','b')` — keep only listed keys that are present. */
	pick(input, args) {
		const source = requireObject(input, "pick");
		const keys = requireKeyArgs(args, "pick");
		const result = new Map<string, JinjaValue>();
		for (const key of keys) {
			if (source.has(key)) result.set(key, source.get(key)!);
		}
		return { kind: "object", value: result };
	},

	/** `object | omit('a','b')` — drop listed keys. */
	omit(input, args) {
		const source = new Map(requireObject(input, "omit"));
		for (const key of requireKeyArgs(args, "omit")) source.delete(key);
		return { kind: "object", value: source };
	},

	/** `array | concat(other)` or `string | concat(other)`. */
	concat(input, args) {
		requireArgs(args, 1, "concat");
		const other = args[0]!;
		if (input.kind === "array" && other.kind === "array") {
			return JV.array([...input.value, ...other.value]);
		}
		if (input.kind === "string" && other.kind === "string") {
			return JV.string(input.value + other.value);
		}
		throw ExpressionError.evaluate(
			`filter 'concat' requires two arrays or two strings, got ${typeName(input)} and ${typeName(other)}`,
		);
	},
};

// MARK: - Registry (declared after standardFilters to avoid TDZ on the static)

/** An immutable, allowlisted set of filters. */
export class FilterRegistry {
	private readonly filters: Map<string, ExpressionFilter>;

	constructor(filters: Record<string, ExpressionFilter> | Map<string, ExpressionFilter> = {}) {
		this.filters =
			filters instanceof Map ? new Map(filters) : new Map(Object.entries(filters));
	}

	filter(name: string): ExpressionFilter | undefined {
		return this.filters.get(name);
	}

	/** The set of filter names. */
	get names(): Set<string> {
		return new Set(this.filters.keys());
	}

	static readonly standard: FilterRegistry = new FilterRegistry({
		// Scalar / collection
		default: standardFilters.default!,
		length: standardFilters.length!,
		min: standardFilters.min!,
		max: standardFilters.max!,
		lower: standardFilters.lower!,
		upper: standardFilters.upper!,
		trim: standardFilters.trim!,
		join: standardFilters.join!,
		abs: standardFilters.abs!,
		round: standardFilters.round!,
		// Structured (transform DSL replacements)
		merge: standardFilters.merge!,
		pick: standardFilters.pick!,
		omit: standardFilters.omit!,
		concat: standardFilters.concat!,
	});
}
