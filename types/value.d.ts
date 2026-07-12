export type JinjaValue = {
    readonly kind: "null";
} | {
    readonly kind: "bool";
    readonly value: boolean;
} | {
    readonly kind: "int";
    readonly value: number;
} | {
    readonly kind: "double";
    readonly value: number;
} | {
    readonly kind: "string";
    readonly value: string;
} | {
    readonly kind: "array";
    readonly value: JinjaValue[];
} | {
    readonly kind: "object";
    readonly value: Map<string, JinjaValue>;
} | {
    readonly kind: "date";
    readonly value: Date;
};
export declare const JV: {
    null: JinjaValue;
    bool(v: boolean): JinjaValue;
    int(v: number): JinjaValue;
    double(v: number): JinjaValue;
    string(v: string): JinjaValue;
    array(v: JinjaValue[]): JinjaValue;
    object(v: Map<string, JinjaValue> | Record<string, JinjaValue>): JinjaValue;
    date(v: Date): JinjaValue;
};
export declare function typeName(v: JinjaValue): string;
export declare function isNumeric(v: JinjaValue): boolean;
/** Numeric value as a double, for `.int`/`.double` only; `undefined` otherwise. */
export declare function asDouble(v: JinjaValue): number | undefined;
declare const INT_MAX_SAFE: number;
/** True if an integer result is representable exactly as a JS number. */
declare function intInRange(x: number): boolean;
export { intInRange, INT_MAX_SAFE };
/** Object-key subscript; `undefined` for a missing key or a non-object. */
export declare function member(v: JinjaValue, key: string): JinjaValue | undefined;
/** Array-index subscript; `undefined` out of range or on a non-array. */
export declare function element(v: JinjaValue, index: number): JinjaValue | undefined;
/**
 * Access nested values using dot notation (`user.name`, `items.0.id`).
 * `undefined` for a missing path. An empty path returns `v`.
 */
export declare function getPath(v: JinjaValue, path: string): JinjaValue | undefined;
export declare function isTruthy(v: JinjaValue): boolean;
export declare function semanticEquals(lhs: JinjaValue, rhs: JinjaValue): boolean;
export type ComparisonResult = -1 | 0 | 1;
export declare const orderedAscending: ComparisonResult;
export declare const orderedSame: ComparisonResult;
export declare const orderedDescending: ComparisonResult;
export declare function semanticCompare(lhs: JinjaValue, rhs: JinjaValue): ComparisonResult;
export declare function renderDouble(d: number): string;
export declare function renderedString(v: JinjaValue): string;
/** ISO8601 internet date-time in UTC with a `Z` suffix (e.g. 1970-01-01T00:00:00Z). */
export declare function iso8601(d: Date): string;
/** Convert to a plain JS JSON graph (null / boolean / number / string / [] / {}). */
export declare function toJSONLogicValue(v: JinjaValue): unknown;
/**
 * Compact JSON string (no spaces), matching Swift's JSONSerialization default
 * (which does not pretty-print). Object key order follows insertion order.
 */
export declare function toJSONString(v: JinjaValue): string;
/**
 * Parse a standard JS JSON value into a JinjaValue.
 *
 * Numbers with no fractional component normalise to `.int` (matching Swift's
 * NSNumber float-vs-int classification on decode); numbers with a fractional
 * part become `.double`.
 */
export declare function fromJSON(json: unknown): JinjaValue;
/** Parse a JSON string into a JinjaValue. */
export declare function fromJSONString(s: string): JinjaValue;
/** Decode a raw JS JSON graph into a JinjaValue, accepting the legacy envelope. */
export declare function decodeJinjaValue(json: unknown): JinjaValue;
/** Parse a JSON string with legacy-envelope support (Swift Codable parity). */
export declare function decodeJinjaValueString(s: string): JinjaValue;
