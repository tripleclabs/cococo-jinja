// Ported from Tests/CococoJinjaTests/JinjaValueJSONTests.swift
//
// The Swift tests distinguish NSNumber-boolean-vs-int via objCType tags — a
// Foundation-specific trap. In JS, `true`/`false` and numbers are already
// distinct primitives, so fromJSON classifies them directly; the ported cases
// still exercise the same intent (0/1 stay ints, true/false stay bools).

import { describe, expect, test } from "bun:test";
import {
	fromJSON,
	fromJSONString,
	toJSONLogicValue,
	toJSONString,
} from "../src/index.ts";
import { expectValue, v } from "./helpers.ts";

describe("JinjaValue JSON", () => {
	// fromJSON
	test("fromJSON with string", () => {
		expectValue(fromJSON("hello"), v.string("hello"));
	});
	test("fromJSON with int", () => {
		expectValue(fromJSON(42), v.int(42));
	});
	test("fromJSON with double", () => {
		expectValue(fromJSON(3.14), v.double(3.14));
	});
	test("fromJSON with bool", () => {
		expectValue(fromJSON(true), v.bool(true));
		expectValue(fromJSON(false), v.bool(false));
	});
	test("fromJSON with null", () => {
		expectValue(fromJSON(null), v.null);
	});
	test("fromJSON with array", () => {
		const result = fromJSON([1, "two", true]);
		expect(result.kind).toBe("array");
		if (result.kind === "array") {
			expect(result.value.length).toBe(3);
			expectValue(result.value[0]!, v.int(1));
			expectValue(result.value[1]!, v.string("two"));
			expectValue(result.value[2]!, v.bool(true));
		}
	});
	test("fromJSON with nested object", () => {
		const result = fromJSON({
			name: "John",
			address: { city: "Berlin", zip: "10115" },
		});
		expect(result.kind).toBe("object");
		if (result.kind === "object") {
			expectValue(result.value.get("name")!, v.string("John"));
			const address = result.value.get("address")!;
			expect(address.kind).toBe("object");
			if (address.kind === "object") {
				expectValue(address.value.get("city")!, v.string("Berlin"));
				expectValue(address.value.get("zip")!, v.string("10115"));
			}
		}
	});

	// fromJSONString
	test("fromJSONString with valid JSON", () => {
		const result = fromJSONString('{"name":"John","age":30}');
		expect(result.kind).toBe("object");
		if (result.kind === "object") {
			expectValue(result.value.get("name")!, v.string("John"));
			expectValue(result.value.get("age")!, v.int(30));
		}
	});
	test("fromJSONString with invalid JSON throws", () => {
		expect(() => fromJSONString("{not valid}")).toThrow();
	});

	// toJSONLogicValue
	test("toJSONLogicValue null", () => {
		expect(toJSONLogicValue(v.null)).toBe(null);
	});
	test("toJSONLogicValue bool", () => {
		expect(toJSONLogicValue(v.bool(true))).toBe(true);
	});
	test("toJSONLogicValue int", () => {
		expect(toJSONLogicValue(v.int(42))).toBe(42);
	});
	test("toJSONLogicValue double", () => {
		expect(toJSONLogicValue(v.double(3.14))).toBe(3.14);
	});
	test("toJSONLogicValue string", () => {
		expect(toJSONLogicValue(v.string("hello"))).toBe("hello");
	});
	test("toJSONLogicValue array", () => {
		const result = toJSONLogicValue(v.array([v.int(1), v.string("two")]));
		expect(Array.isArray(result)).toBe(true);
		const arr = result as unknown[];
		expect(arr.length).toBe(2);
		expect(arr[0]).toBe(1);
		expect(arr[1]).toBe("two");
	});
	test("toJSONLogicValue object", () => {
		const result = toJSONLogicValue(v.object({ key: v.string("value") })) as Record<
			string,
			unknown
		>;
		expect(result.key).toBe("value");
	});
	test("toJSONLogicValue date", () => {
		const result = toJSONLogicValue(v.date(new Date(1_000_000 * 1000)));
		expect(typeof result).toBe("string");
		expect((result as string).length).toBeGreaterThan(0);
		expect(Number.isNaN(Date.parse(result as string))).toBe(false);
	});

	// Round-trips
	test("toJSONString and fromJSONString round-trip", () => {
		const original = v.object({
			name: v.string("test"),
			count: v.int(42),
			active: v.bool(true),
		});
		const jsonString = toJSONString(original);
		expect(jsonString.length).toBeGreaterThan(0);
		const parsed = fromJSONString(jsonString);
		expect(parsed.kind).toBe("object");
		if (parsed.kind === "object") {
			expectValue(parsed.value.get("name")!, v.string("test"));
			expectValue(parsed.value.get("count")!, v.int(42));
			expectValue(parsed.value.get("active")!, v.bool(true));
		}
	});
});
