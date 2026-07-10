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

**Int/double (resolved):** JS `number` cannot distinguish int from double, so the
TS `JinjaValue` is a **tagged union** (`{kind:'int'}` vs `{kind:'double'}`);
rendering (`12` vs `12.0`) and arithmetic key off the tag, matching Swift.

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
swift test              # CococoJinja — 194 tests (+ Linux via CI)
bun install && bun test # @cococo/jinja — 207 tests, incl. the shared fixture parity
```

## Status

**Both engines complete and green.** Swift `CococoJinja` — 194 tests, no external
dependencies, Linux-capable (extracted from WorkflowKit; `RuleSubset` /
`ExecutionContext+Expression` / json-logic bits excluded). TS `@cococo/jinja` — 207
tests + the shared fixture parity, `tsc` clean; the two are proven identical by
`fixtures/expression/`.

**Cross-language parity caveats** (ASCII/BMP-safe; untested in both suites): string
length is code-points (TS) vs grapheme clusters (Swift); TS models int overflow at
2^53, Swift `Int` at 2^63; `round` is half-away-from-zero on both.

Fixtures are **native Jinja** (bare-identifier roots inside `{{ }}`). The
`$.`-rooted form (`$.state.x`) is a **surface layer** on top of this engine
(cococo-surfaces / SurfaceKit), not part of it — `$` doesn't even lex here.
