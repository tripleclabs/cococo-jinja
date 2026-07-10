// value.ts — port of JinjaValue.swift, JinjaValue+JSON.swift, JinjaValue+Semantics.swift
//
// The value model. JS `number` cannot distinguish Swift's `.int` from
// `.double`, so JinjaValue is a TAGGED discriminated union that carries the
// distinction explicitly. Rendering (`12` vs `12.0`) and arithmetic (int stays
// int, `/` yields double, …) both depend on the tag, matching Swift exactly.

import { ExpressionError } from "./errors.ts";

// MARK: - The tagged value

export type JinjaValue =
	| { readonly kind: "null" }
	| { readonly kind: "bool"; readonly value: boolean }
	| { readonly kind: "int"; readonly value: number }
	| { readonly kind: "double"; readonly value: number }
	| { readonly kind: "string"; readonly value: string }
	| { readonly kind: "array"; readonly value: JinjaValue[] }
	// `entries` preserves insertion order (Swift's `[String: JinjaValue]` is
	// unordered, but object literals in the interpreter build ordered maps; we
	// keep order so rendering is stable, matching the JS `Map`-like intent).
	| { readonly kind: "object"; readonly value: Map<string, JinjaValue> }
	| { readonly kind: "date"; readonly value: Date };

// MARK: - Constructors (mirror Swift's enum cases)

export const JV = {
	null: { kind: "null" } as JinjaValue,
	bool(v: boolean): JinjaValue {
		return { kind: "bool", value: v };
	},
	int(v: number): JinjaValue {
		return { kind: "int", value: Math.trunc(v) };
	},
	double(v: number): JinjaValue {
		return { kind: "double", value: v };
	},
	string(v: string): JinjaValue {
		return { kind: "string", value: v };
	},
	array(v: JinjaValue[]): JinjaValue {
		return { kind: "array", value: v };
	},
	object(v: Map<string, JinjaValue> | Record<string, JinjaValue>): JinjaValue {
		const map = v instanceof Map ? v : new Map(Object.entries(v));
		return { kind: "object", value: map };
	},
	date(v: Date): JinjaValue {
		return { kind: "date", value: v };
	},
};

// MARK: - Type name (for error messages)

export function typeName(v: JinjaValue): string {
	return v.kind;
}

// MARK: - Accessors

export function isNumeric(v: JinjaValue): boolean {
	return v.kind === "int" || v.kind === "double";
}

/** Numeric value as a double, for `.int`/`.double` only; `undefined` otherwise. */
export function asDouble(v: JinjaValue): number | undefined {
	if (v.kind === "int" || v.kind === "double") return v.value;
	return undefined;
}

// MARK: - Int overflow modelling
//
// Swift `Int` is 64-bit; a JS number is a float64 with 53 bits of integer
// precision. We treat |x| > Number.MAX_SAFE_INTEGER as "overflow" so arithmetic
// that would lose integer precision fails loudly (matching the SPIRIT of Swift's
// trap-free overflow errors) rather than silently returning a wrong int.
const INT_MAX_SAFE = Number.MAX_SAFE_INTEGER; // 2^53 - 1

/** True if an integer result is representable exactly as a JS number. */
function intInRange(x: number): boolean {
	return Number.isFinite(x) && Math.abs(x) <= INT_MAX_SAFE;
}

export { intInRange, INT_MAX_SAFE };

// MARK: - Subscript / path access (parity with JinjaValue's Swift subscripts)

/** Object-key subscript; `undefined` for a missing key or a non-object. */
export function member(v: JinjaValue, key: string): JinjaValue | undefined {
	if (v.kind !== "object") return undefined;
	return v.value.get(key);
}

/** Array-index subscript; `undefined` out of range or on a non-array. */
export function element(v: JinjaValue, index: number): JinjaValue | undefined {
	if (v.kind !== "array") return undefined;
	if (index < 0 || index >= v.value.length) return undefined;
	return v.value[index];
}

/**
 * Access nested values using dot notation (`user.name`, `items.0.id`).
 * `undefined` for a missing path. An empty path returns `v`.
 */
export function getPath(v: JinjaValue, path: string): JinjaValue | undefined {
	if (path === "") return v;
	let current: JinjaValue = v;
	for (const component of path.split(".")) {
		const asIndex = /^\d+$/.test(component) ? Number(component) : undefined;
		const next =
			asIndex !== undefined ? element(current, asIndex) : member(current, component);
		if (next === undefined) return undefined;
		current = next;
	}
	return current;
}

// MARK: - Truthiness (§3)
//
// Falsy: null, false, 0, 0.0, "", [], {}. Truthy: everything else, incl. any date.

export function isTruthy(v: JinjaValue): boolean {
	switch (v.kind) {
		case "null":
			return false;
		case "bool":
			return v.value;
		case "int":
			return v.value !== 0;
		case "double":
			return v.value !== 0;
		case "string":
			return v.value.length > 0;
		case "array":
			return v.value.length > 0;
		case "object":
			return v.value.size > 0;
		case "date":
			return true;
	}
}

// MARK: - Semantic equality (§11.4)
//
// Numbers compare by value across int/double (1 == 1.0). Cross-type is false,
// never an error. Arrays/objects compare deeply with these same rules.

export function semanticEquals(lhs: JinjaValue, rhs: JinjaValue): boolean {
	if (lhs.kind === "int" && rhs.kind === "int") {
		return lhs.value === rhs.value;
	}
	// At least one double involved (and both numeric) — compare as Double.
	if (isNumeric(lhs) && isNumeric(rhs)) {
		return asDouble(lhs) === asDouble(rhs);
	}
	if (lhs.kind === "string" && rhs.kind === "string") return lhs.value === rhs.value;
	if (lhs.kind === "bool" && rhs.kind === "bool") return lhs.value === rhs.value;
	if (lhs.kind === "null" && rhs.kind === "null") return true;
	if (lhs.kind === "date" && rhs.kind === "date") {
		return lhs.value.getTime() === rhs.value.getTime();
	}
	if (lhs.kind === "array" && rhs.kind === "array") {
		if (lhs.value.length !== rhs.value.length) return false;
		for (let i = 0; i < lhs.value.length; i++) {
			if (!semanticEquals(lhs.value[i]!, rhs.value[i]!)) return false;
		}
		return true;
	}
	if (lhs.kind === "object" && rhs.kind === "object") {
		if (lhs.value.size !== rhs.value.size) return false;
		for (const [key, av] of lhs.value) {
			const bv = rhs.value.get(key);
			if (bv === undefined || !semanticEquals(av, bv)) return false;
		}
		return true;
	}
	return false;
}

// MARK: - Ordered comparison (§11.5)
//
// Defined only between two numbers, two strings, or two dates. Any other pairing
// throws. Returns -1 (ascending), 0 (same), 1 (descending) — mirroring Swift's
// ComparisonResult { .orderedAscending, .orderedSame, .orderedDescending }.

export type ComparisonResult = -1 | 0 | 1;
export const orderedAscending: ComparisonResult = -1;
export const orderedSame: ComparisonResult = 0;
export const orderedDescending: ComparisonResult = 1;

function compareScalars<T extends number | string>(a: T, b: T): ComparisonResult {
	if (a === b) return orderedSame;
	return a < b ? orderedAscending : orderedDescending;
}

export function semanticCompare(lhs: JinjaValue, rhs: JinjaValue): ComparisonResult {
	const a = asDouble(lhs);
	const b = asDouble(rhs);
	if (a !== undefined && b !== undefined) {
		if (Number.isNaN(a) || Number.isNaN(b)) {
			throw ExpressionError.evaluate("cannot order NaN");
		}
		return compareScalars(a, b);
	}
	if (lhs.kind === "string" && rhs.kind === "string") {
		return compareScalars(lhs.value, rhs.value);
	}
	if (lhs.kind === "date" && rhs.kind === "date") {
		return compareScalars(lhs.value.getTime(), rhs.value.getTime());
	}
	throw ExpressionError.evaluate(
		`cannot order ${typeName(lhs)} and ${typeName(rhs)}; ` +
			"ordered comparison requires two numbers, two strings, or two dates",
	);
}

// MARK: - Double rendering (must match Swift's String(Double))
//
// Swift's `String(Double)` prints the shortest decimal that round-trips, always
// with a decimal point for integral values (`2.0`, not `2`). JS `String(number)`
// prints `2` for 2.0 and drops the point — so we add it back. Both use the same
// shortest-round-trip algorithm (Grisu/Ryū) for the significant digits, so the
// digit sequences agree; only the integral trailing `.0` differs.

export function renderDouble(d: number): string {
	if (Number.isNaN(d)) return "nan";
	if (d === Infinity) return "inf";
	if (d === -Infinity) return "-inf";
	// Swift's String(-0.0) is "-0.0"; JS String(-0) drops the sign.
	if (d === 0 && Object.is(d, -0)) return "-0.0";
	let s = String(d);
	// JS uses `e` exponent form for very large/small magnitudes, same as Swift's
	// Double description (e.g. 1e+30). Swift prints e.g. `1e+30`; JS prints
	// `1e+30` too. For non-exponent integral values, append `.0`.
	if (!s.includes(".") && !s.includes("e") && !s.includes("E") && !s.includes("n")) {
		s += ".0";
	}
	return s;
}

// MARK: - Text rendering (§3 / §6 string projection)

export function renderedString(v: JinjaValue): string {
	switch (v.kind) {
		case "null":
			return "";
		case "bool":
			return v.value ? "true" : "false";
		case "int":
			return String(v.value);
		case "double":
			return renderDouble(v.value);
		case "string":
			return v.value;
		case "date":
			return iso8601(v.value);
		case "array":
		case "object":
			return toJSONString(v);
	}
}

/** ISO8601 internet date-time in UTC with a `Z` suffix (e.g. 1970-01-01T00:00:00Z). */
export function iso8601(d: Date): string {
	// Swift's ISO8601DateFormatter with .withInternetDateTime emits seconds
	// precision and a `Z` zone, no fractional seconds.
	return d.toISOString().replace(/\.\d{3}Z$/, "Z");
}

// MARK: - JSON encode / decode
//
// Wire format is PLAIN JSON. `.date` encodes to an ISO8601 string and is NOT
// re-parsed on decode. Integral doubles normalise to `.int` on decode.

/** Convert to a plain JS JSON graph (null / boolean / number / string / [] / {}). */
export function toJSONLogicValue(v: JinjaValue): unknown {
	switch (v.kind) {
		case "null":
			return null;
		case "bool":
			return v.value;
		case "int":
			return v.value;
		case "double":
			return v.value;
		case "string":
			return v.value;
		case "date":
			return iso8601(v.value);
		case "array":
			return v.value.map(toJSONLogicValue);
		case "object": {
			const out: Record<string, unknown> = {};
			for (const [k, val] of v.value) out[k] = toJSONLogicValue(val);
			return out;
		}
	}
}

/**
 * Compact JSON string (no spaces), matching Swift's JSONSerialization default
 * (which does not pretty-print). Object key order follows insertion order.
 */
export function toJSONString(v: JinjaValue): string {
	return JSON.stringify(toJSONLogicValue(v));
}

/**
 * Parse a standard JS JSON value into a JinjaValue.
 *
 * Numbers with no fractional component normalise to `.int` (matching Swift's
 * NSNumber float-vs-int classification on decode); numbers with a fractional
 * part become `.double`.
 */
export function fromJSON(json: unknown): JinjaValue {
	if (json === null || json === undefined) return JV.null;
	if (typeof json === "boolean") return JV.bool(json);
	if (typeof json === "number") {
		// Integral doubles normalise to int on decode (per Swift policy).
		if (Number.isInteger(json)) return JV.int(json);
		return JV.double(json);
	}
	if (typeof json === "string") return JV.string(json);
	if (Array.isArray(json)) return JV.array(json.map(fromJSON));
	if (typeof json === "object") {
		const map = new Map<string, JinjaValue>();
		for (const [k, val] of Object.entries(json as Record<string, unknown>)) {
			map.set(k, fromJSON(val));
		}
		return { kind: "object", value: map };
	}
	// Fallback: stringify anything unexpected.
	return JV.string(String(json));
}

/** Parse a JSON string into a JinjaValue. */
export function fromJSONString(s: string): JinjaValue {
	return fromJSON(JSON.parse(s));
}

// MARK: - Codable-parity decode (plain JSON + legacy tagged envelope)
//
// Mirrors Swift's `JinjaValue.init(from:)`: accepts plain JSON, but also the
// pre-cutover tagged `{ type, value }` envelope (whose keys are EXACTLY {type}
// or {type,value} and whose `type` is a known keyword). Encoding is always plain
// (via toJSONLogicValue), so a legacy value re-encodes plain (migrate-on-load).

const LEGACY_TYPES = new Set([
	"null",
	"bool",
	"int",
	"double",
	"string",
	"array",
	"object",
	"date",
]);

/** Decode a raw JS JSON graph into a JinjaValue, accepting the legacy envelope. */
export function decodeJinjaValue(json: unknown): JinjaValue {
	const legacy = decodeLegacyTaggedEnvelope(json);
	if (legacy !== undefined) return legacy;
	return fromJSON(json);
}

/** Parse a JSON string with legacy-envelope support (Swift Codable parity). */
export function decodeJinjaValueString(s: string): JinjaValue {
	return decodeJinjaValue(JSON.parse(s));
}

function decodeLegacyTaggedEnvelope(json: unknown): JinjaValue | undefined {
	if (json === null || typeof json !== "object" || Array.isArray(json)) return undefined;
	const obj = json as Record<string, unknown>;
	const keys = Object.keys(obj);
	const keySet = new Set(keys);
	const exactType = keySet.size === 1 && keySet.has("type");
	const exactTypeValue = keySet.size === 2 && keySet.has("type") && keySet.has("value");
	if (!exactType && !exactTypeValue) return undefined;
	const type = obj.type;
	if (typeof type !== "string" || !LEGACY_TYPES.has(type)) return undefined;
	switch (type) {
		case "null":
			return JV.null;
		case "bool":
			return JV.bool(Boolean(obj.value));
		case "int":
			return JV.int(Number(obj.value));
		case "double":
			return JV.double(Number(obj.value));
		case "string":
			return JV.string(String(obj.value));
		case "array":
			return JV.array((obj.value as unknown[]).map(decodeJinjaValue));
		case "object": {
			const map = new Map<string, JinjaValue>();
			for (const [k, val] of Object.entries(obj.value as Record<string, unknown>)) {
				map.set(k, decodeJinjaValue(val));
			}
			return { kind: "object", value: map };
		}
		case "date":
			// Legacy stored a Unix timestamp (seconds).
			return JV.date(new Date(Number(obj.value) * 1000));
		default:
			return undefined;
	}
}
