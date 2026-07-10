# cococo-jinja

The **one** Jinja-subset expression engine for the CoCoCo platform — a Swift core
(`CococoJinja`) extracted verbatim from WorkflowKit, plus a TypeScript peer
(`@cococo/jinja`) that reproduces it exactly. The two are kept identical by a
shared, language-neutral **fixture** suite.

## Why this exists

The evaluator was forked: WorkflowKit (server) and cococo-app (native) drifted to
**different** Jinja dialects, so an expression that renders one way in a workflow
renders differently in a workspace/journey — impossible for end users to reason
about. `cococo-jinja` is the single source of truth both sides depend on.

Consumers (all pin the same version):
- **WorkflowKit** (platform server) — replaces its in-tree `Expression/`.
- **SurfaceKit** (journeys + workspaces; native app + server) — its `Expression` core.
- **cococo-app** — replaces its `JinjaValue` fork.
- **@cococo/surfaces** (cococo-ui) — via the TS peer.

## Layout

```
Package.swift          Swift: CococoJinja (Linux + Apple, no external deps)
Sources/CococoJinja/   the engine: Lexer / Parser / AST / Interpreter / Filters /
                       Template / Validator / Limits + JinjaValue
Tests/                 ported WorkflowKit Expression tests + the fixture runner
package.json           TS: @cococo/jinja (bun)
ts/                    the TS peer + parity tests
fixtures/expression/   language-neutral cases {expr, expect} — the same-behaviour contract
```

## The grammar (parity target)

Value types `null/bool/int/double/string/array/object/date` (**int≠double**
preserved). Filters `default length upper lower trim abs round(n) join(sep) min max
merge pick omit concat`. Operators `== != < <= > >= in (not in) ~ + - * / // %
and or not` + unary `-`, ternary `x if c else y`, member `.k` / index `[i]`.
Standalone `{{ }}` → typed value; mixed with text → string; missing → null/"".

**Known impedance:** JS `number` cannot distinguish int from double. The TS peer
must reconcile the int/double rendering rule (`12` vs `12.0`) against the Swift
engine — tracked in the fixtures.

## Consuming it

Swift (SwiftPM git dep):
```swift
.package(url: "https://github.com/tripleclabs/cococo-jinja.git", branch: "main")
```
TypeScript (bun git dep):
```jsonc
"@cococo/jinja": "github:tripleclabs/cococo-jinja#<tag>"
```

## Develop

```bash
swift test              # CococoJinja (+ Linux via CI)
bun install && bun test # TS peer (parity tests skipped until the peer is ported)
```

## Status

Swift `CococoJinja` **extracted and green** — 194 tests, **no external
dependencies**, Linux-capable (ported from WorkflowKit; `RuleSubset` /
`ExecutionContext+Expression` / json-logic bits excluded). The TS peer is a
skeleton (parity tests skipped until it's ported — seed it from cococo-ui
`src/expression.ts` + `src/json/path.ts`).

Fixtures are **native Jinja** (bare-identifier roots inside `{{ }}`). The
`$.`-rooted form (`$.state.x`) is a **surface layer** on top of this engine
(cococo-surfaces / SurfaceKit), not part of it — `$` doesn't even lex here.
