// Ported from Tests/CococoJinjaTests/JinjaValueTests.swift
//
// Swift-specific mechanics NOT ported: ExpressibleBy*Literal conformances and the
// convenience `init(_:)` overloads test Swift's literal-syntax sugar, which has no
// TS analogue — the equivalent is just calling JV.int(42) etc. (covered elsewhere).

import { describe, expect, test } from "bun:test";
import {
	decodeJinjaValueString,
	element,
	getPath,
	type JinjaValue,
	JV,
	member,
	toJSONLogicValue,
	toJSONString,
} from "../src/index.ts";
import { expectValue } from "./helpers.ts";

// Encode a JinjaValue to a compact JSON string (Swift's plain-JSON Codable).
function encode(v: JinjaValue): string {
	return toJSONString(v);
}
function decode(s: string): JinjaValue {
	return decodeJinjaValueString(s);
}

// Round-trip: encode plain, decode plain, expect strict equality.
function assertRoundtrip(value: JinjaValue): void {
	expectValue(decode(encode(value)), value);
}

describe("JinjaValue", () => {
	// Codable roundtrip
	test("null roundtrips", () => assertRoundtrip(JV.null));
	test("bool roundtrips", () => {
		assertRoundtrip(JV.bool(true));
		assertRoundtrip(JV.bool(false));
	});
	test("int roundtrips", () => {
		assertRoundtrip(JV.int(42));
		assertRoundtrip(JV.int(-1));
		assertRoundtrip(JV.int(0));
	});
	test("double roundtrips", () => assertRoundtrip(JV.double(3.14)));
	test("string roundtrips", () => {
		assertRoundtrip(JV.string("hello"));
		assertRoundtrip(JV.string(""));
	});
	test("array roundtrips", () => {
		assertRoundtrip(JV.array([JV.int(1), JV.string("two"), JV.null]));
	});
	test("object roundtrips", () => assertRoundtrip(JV.object({ k: JV.int(1) })));

	test("date encodes to an ISO8601 string (lossy by policy)", () => {
		const date = new Date(1_700_000_000 * 1000);
		expect(encode(JV.date(date))).toBe('"2023-11-14T22:13:20Z"');
		const decoded = decode(encode(JV.date(date)));
		expectValue(decoded, JV.string("2023-11-14T22:13:20Z"));
	});

	// Plain wire format
	test("encodes as plain JSON (no {type,value} envelope)", () => {
		expect(encode(JV.null)).toBe("null");
		expect(encode(JV.bool(true))).toBe("true");
		expect(encode(JV.int(42))).toBe("42");
		expect(encode(JV.string("hi"))).toBe('"hi"');
		expect(encode(JV.array([JV.int(1), JV.string("two")]))).toBe('[1,"two"]');
		expect(encode(JV.object({ k: JV.int(1) }))).toBe('{"k":1}');
	});

	test("decodes natural plain JSON", () => {
		expectValue(decode("null"), JV.null);
		expectValue(decode("true"), JV.bool(true));
		expectValue(decode("42"), JV.int(42));
		expectValue(decode("3.14"), JV.double(3.14));
		expectValue(decode('"hi"'), JV.string("hi"));
		expectValue(decode('[1,"two"]'), JV.array([JV.int(1), JV.string("two")]));
		expectValue(decode('{"k":1}'), JV.object({ k: JV.int(1) }));
	});

	test("integral doubles normalise to int on decode", () => {
		expectValue(decode("5.0"), JV.int(5));
	});

	// Legacy tagged-envelope decoding
	test("decodes legacy tagged {type,value} envelopes", () => {
		expectValue(decode('{"type":"null"}'), JV.null);
		expectValue(decode('{"type":"bool","value":true}'), JV.bool(true));
		expectValue(decode('{"type":"int","value":7}'), JV.int(7));
		expectValue(decode('{"type":"double","value":3.5}'), JV.double(3.5));
		expectValue(decode('{"type":"string","value":"hi"}'), JV.string("hi"));
		expectValue(decode('{"type":"array","value":[{"type":"int","value":1}]}'), JV.array([JV.int(1)]));
		expectValue(
			decode('{"type":"object","value":{"k":{"type":"int","value":1}}}'),
			JV.object({ k: JV.int(1) }),
		);
		expectValue(decode('{"type":"date","value":1700000000}'), JV.date(new Date(1_700_000_000 * 1000)));
	});

	test("plain object without a known type keyword is not treated as legacy", () => {
		expectValue(
			decode('{"type":"widget","value":3}'),
			JV.object({ type: JV.string("widget"), value: JV.int(3) }),
		);
	});

	test("object with a reserved type keyword but extra fields stays plain", () => {
		expectValue(
			decode('{"type":"int","value":5,"label":"x"}'),
			JV.object({ type: JV.string("int"), value: JV.int(5), label: JV.string("x") }),
		);
	});

	test("legacy tagged value re-encodes as plain (migrate-on-load)", () => {
		const decoded = decode('{"type":"object","value":{"n":{"type":"int","value":1}}}');
		expect(encode(decoded)).toBe('{"n":1}');
	});

	test("Nested structure roundtrips", () => {
		const value = JV.object({
			items: JV.array([
				JV.object({ id: JV.int(1), name: JV.string("A") }),
				JV.object({ id: JV.int(2), active: JV.bool(true) }),
			]),
			total: JV.int(2),
		});
		assertRoundtrip(value);
	});

	// Type accessors (the discriminated `kind` replaces Swift's optional accessors)
	test("isNull", () => {
		expect(JV.null.kind === "null").toBe(true);
		expect(JV.int(0).kind === "null").toBe(false);
	});

	// Subscript access
	test("String subscript on object", () => {
		const v = JV.object({ name: JV.string("Alice") });
		expectValue(member(v, "name")!, JV.string("Alice"));
		expect(member(v, "missing")).toBeUndefined();
	});
	test("String subscript on non-object returns undefined", () => {
		expect(member(JV.int(1), "key")).toBeUndefined();
	});
	test("Int subscript on array", () => {
		const v = JV.array([JV.int(10), JV.int(20), JV.int(30)]);
		expectValue(element(v, 0)!, JV.int(10));
		expectValue(element(v, 2)!, JV.int(30));
	});
	test("Int subscript out of bounds returns undefined", () => {
		const v = JV.array([JV.int(1)]);
		expect(element(v, -1)).toBeUndefined();
		expect(element(v, 1)).toBeUndefined();
	});
	test("Int subscript on non-array returns undefined", () => {
		expect(element(JV.string("x"), 0)).toBeUndefined();
	});

	// Path-based access
	test("getPath navigates nested objects", () => {
		const v = JV.object({ user: JV.object({ name: JV.string("Alice") }) });
		expectValue(getPath(v, "user.name")!, JV.string("Alice"));
	});
	test("getPath navigates arrays by index", () => {
		const v = JV.object({ items: JV.array([JV.string("a"), JV.string("b")]) });
		expectValue(getPath(v, "items.1")!, JV.string("b"));
	});
	test("getPath returns undefined for missing path", () => {
		const v = JV.object({ x: JV.int(1) });
		expect(getPath(v, "x.y.z")).toBeUndefined();
	});
	test("getPath with empty path returns self", () => {
		expectValue(getPath(JV.int(42), "")!, JV.int(42));
	});
	test("getPath deep nested path", () => {
		const v = JV.object({
			a: JV.object({ b: JV.array([JV.object({ c: JV.string("found") })]) }),
		});
		expectValue(getPath(v, "a.b.0.c")!, JV.string("found"));
	});

	// Constructors (analogue of Swift's convenience inits / literals)
	test("JV constructors build the tagged cases", () => {
		expectValue(JV.bool(true), JV.bool(true));
		expectValue(JV.int(42), JV.int(42));
		expectValue(JV.double(3.14), JV.double(3.14));
		expectValue(JV.string("hi"), JV.string("hi"));
		expectValue(JV.array([JV.int(1)]), JV.array([JV.int(1)]));
		expectValue(JV.object({ k: JV.int(1) }), JV.object({ k: JV.int(1) }));
		const d = new Date();
		expectValue(JV.date(d), JV.date(d));
	});

	// toJSONLogicValue sanity (used by JSON tests too)
	test("toJSONLogicValue produces a plain graph", () => {
		expect(toJSONLogicValue(JV.int(1))).toBe(1);
		expect(toJSONLogicValue(JV.null)).toBe(null);
	});
});
