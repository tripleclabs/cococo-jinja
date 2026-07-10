// @cococo/jinja — TS peer of the canonical Jinja-subset engine (Swift: CococoJinja).
//
// Same behaviour as the Swift engine, proven by the shared `fixtures/`. PORT IN
// PROGRESS — the evaluator is not implemented yet; the parity tests are skipped
// until it lands (ts/test/parity.test.ts).
//
// CAVEAT (design decision pending): the Swift engine distinguishes `.int` from
// `.double`; JS `number` does not. The int/double rendering rule (`12` vs `12.0`)
// must be reconciled here — see fixtures + cococo-app Gateway/Workspaces/Expression.

export type JinjaValue =
	| null
	| boolean
	| number
	| string
	| JinjaValue[]
	| { [key: string]: JinjaValue };

/**
 * Evaluate a Jinja-subset expression / template. `roots` is the single root
 * context object; its top-level keys are addressed by BARE identifiers inside
 * `{{ }}` (e.g. `{{ state.count }}`, `{{ state.items[0] }}`). The `$.`-rooted
 * form (`$.state.x`) is a surface layer, NOT this engine.
 */
export function evaluate(_expression: string, _roots: Record<string, JinjaValue>): JinjaValue {
	throw new Error(
		"CococoJinja TS peer not yet ported — see fixtures/expression for the parity target.",
	);
}
