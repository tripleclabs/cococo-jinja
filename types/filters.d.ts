import { type JinjaValue } from "./value.ts";
export type ExpressionFilter = (input: JinjaValue, args: JinjaValue[]) => JinjaValue;
export declare const standardFilters: Record<string, ExpressionFilter>;
/** An immutable, allowlisted set of filters. */
export declare class FilterRegistry {
    private readonly filters;
    constructor(filters?: Record<string, ExpressionFilter> | Map<string, ExpressionFilter>);
    filter(name: string): ExpressionFilter | undefined;
    /** The set of filter names. */
    get names(): Set<string>;
    static readonly standard: FilterRegistry;
}
