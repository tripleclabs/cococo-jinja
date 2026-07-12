import { FilterRegistry } from "./filters.ts";
export type ExpressionFormat = "PREDICATE" | "TEMPLATE";
export type ExpressionDiagnosticSeverity = "ERROR" | "WARNING";
export interface ExpressionDiagnostic {
    line: number;
    column: number;
    /** 0-based character offset into the source, or -1 when unavailable. */
    offset: number;
    severity: ExpressionDiagnosticSeverity;
    message: string;
    /** The phase that produced it: lex, parse, evaluate, or filter. */
    phase: string;
}
export interface ExpressionValidationResult {
    success: boolean;
    diagnostics: ExpressionDiagnostic[];
}
/** Validate a workflow-expression source without evaluating it. */
export declare function validate(source: string, format: ExpressionFormat, filters?: FilterRegistry): ExpressionValidationResult;
