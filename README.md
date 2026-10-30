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
fixtures/expression/   language-neutral cases {expr, expect | error} — the same-behaviour contract
fixtures/value/        JSON decoding cases (plain + legacy envelopes)
```

## JSON decoding

Numbers follow WorkflowKit's policy. `fromJSONString` / `fromJSONData` decode
numeric tokens with `JSONDecoder` (Foundation's `NSNumber` bridge can round a
`Double` by one ULP on Linux) and then apply `canonicalized`: every exactly
integral double that fits an `Int` becomes `.int` (`1.0` and `1e3` are ints,
`1e300` stays a double). Non-finite numbers (`1e9999`) are rejected.
`intValue` likewise accepts an exactly integral `.double`, so `round(2.0)` works.
The TS peer's `fromJSONString`, `fromJSON`, `canonicalized` and `intValue` do the
same.

`JSONDecoder` decodes `JinjaValue` as plain JSON. Objects retain their keys even
when they look like old tagged envelopes: `{"type":"null"}` stays an object,
as does `{"type":"string","value":"hello"}`. This also preserves JSON Schema
nodes without requiring extra metadata.

### Legacy tagged envelopes

Data written before the plain-JSON cutover used a `{ "type": ..., "value": ... }`
envelope. Persistence readers of that data opt in explicitly:

```swift
let decoder = JSONDecoder()
decoder.userInfo[JinjaValue.decodeLegacyTaggedEnvelopes] = true
let value = try decoder.decode(JinjaValue.self, from: storedData)
```

The rule is exactly WorkflowKit's `.workflowLegacyTaggedValues` (the flag
`WorkflowValueStorage` sets for unframed historical data), so a platform reader
gets identical results by setting this key instead:

- Only an object whose keys are **exactly** `{type}` or `{type, value}`, with
  `type` one of `null bool int double string array object date`, is an envelope.
  Anything else (other `type` values, extra keys) decodes as a plain object.
- An envelope's `value` must match its `type` (`date` is Unix seconds; `null`
  ignores `value`). A missing or mismatched `value` — including `{"type":"string"}`
  on its own — **throws**; it is never reinterpreted as a plain object.
- The option applies recursively, including inside other `Decodable` models.
  Envelope payloads are not `canonicalized` (`{"type":"double","value":5}` is
  `.double(5)`).

Use it only for data known to use legacy encoding. Encoding always writes plain
JSON, so newly encoded data should be read with the default decoder. The TS
peer's `decodeJinjaValue` / `decodeJinjaValueString` apply the same rule (a
mismatched envelope throws a `TypeError`).

`fixtures/value/json-decoding.json` pins both decoding modes for both languages.

## Parse budget

Every template, validator and `Parser` parse is bounded, as in WorkflowKit: at
most 10 000 tokens (including end-of-input), 256 parser recursion steps (each
parenthesised level costs 3) and an AST nesting depth of 64. Violations are
`parse` errors. `ExpressionParser.parse` / `parseBounded` keep their own, tighter
configurable limits.

## The grammar (parity target)

Value types `null/bool/int/double/string/array/object/date` (**int≠double**
preserved). Filters `default length upper lower trim abs round(n) join(sep) min max
merge pick omit concat`. Operators `== != < <= > >= in (not in) ~ + - * / // %
and or not` + unary `-`, ternary `x if c else y`, member `.k` / index `[i]`.
Object literals `{'k': v}` (nestable inside `{{ }}`).
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
swift test              # CococoJinja — 221 tests (199 Swift Testing + 22 XCTest; + Linux via CI)
bun install && bun test # @cococo/jinja — 283 tests, incl. the shared fixture parity
```

## Status

**Both engines complete and green.** Swift `CococoJinja` — 221 tests, no external
dependencies, Linux-capable (extracted from WorkflowKit; `RuleSubset` /
`ExecutionContext+Expression` / json-logic bits excluded). TS `@cococo/jinja` — 283
tests + the shared fixture parity, `tsc` clean; the two are proven identical by
`fixtures/expression/`.

**Cross-language parity caveats** (ASCII/BMP-safe; untested in both suites): string
length is code-points (TS) vs grapheme clusters (Swift); TS models int overflow at
2^53, Swift `Int` at 2^63; `round` is half-away-from-zero on both; JSON nesting
depth limits are each platform's own JSON parser's.

Fixtures are **native Jinja** (bare-identifier roots inside `{{ }}`). The
`$.`-rooted form (`$.state.x`) is a **surface layer** on top of this engine
(cococo-surfaces / SurfaceKit), not part of it — `$` doesn't even lex here.
