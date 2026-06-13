# The `std:` scheme + the embedded VL std (H0 Phase 2) — design

The plan for shipping a `.vl` standard library (`std:fmt`, `std:test`, then
collections) resolved through the `std:` specifier scheme, over the
two-primitive intrinsic floor, in BOTH compile pipelines (TS host + native) and
BOTH LSP checkers (TS moduleGraph + wasm checker). This is ROADMAP "Kill the TS
host" step 3 / H0 Phase 2, and it doubles as the demand-driven discovery engine
for the native emitter's long tail — each std module that hits an emitter gap
fails loudly and becomes a burn-down item.

The test RUNNER (`vl test` — discovery, parallel execution, reporting) is the
sibling design: `docs/test-runner-design.md`. The two meet at `std:test`'s
surface (D5).

## Verified facts (the ground this stands on)

**The two-primitive intrinsic floor is DEFINED but NOT IMPLEMENTED.**
`docs/collections-design.md` §LS.2 derives it: a pure-VL `List` is blocked on
exactly (1) dynamic-length array allocation (`__array_new__<T>(length, fill)` /
`__array_new_default__<T>(length)` → `array.new`/`array.new_default`) and
(2) bulk `__array_copy__` → `array.copy`. Neither name exists in either
compiler today (verified by grep); exposing them is ROADMAP B6b's
"Prerequisite intrinsics" and is Slice 0 here.

**The intrinsic floor as it exists today.** Host: `compiler/defaultScope.ts` —
the `__store_*__`/`__load_i32__`/`__log*__`/`__memory_*__` memory intrinsics
(defaultScope.ts:341-456), the type-dispatching `print` builtin (:499), and
`fromCodePoints(i32[]): string` (:564-568). Native: the same floor declared in
`compiler/typecheck.vl:692-705`; `fromCodePoints` checked at :3839-3855.
`print`'s per-type dispatch lives in codegen over per-type sinks the hosts
implement — the "thin sinks + codegen dispatch" shape of
collections-design.md §LS.3.

**Both module pipelines reject `std:` today, deliberately.**
- TS host: `resolveSpecifier` returns `undefined` for any non-relative
  specifier (`compiler/modules.ts:149-157`); `loadProgram` reports
  `Unsupported import specifier … std: and bare specifiers are not yet
  implemented` (:269-277). The CLI injects a Deno filesystem `ModuleReader`
  (cli.ts:66-86); `ModuleReader` is the injectable seam (modules.ts:61-66).
- Native: `modResolveSpecifier` returns `""` for non-relative specifiers
  (scripts/vl-compiler-driver.vl:389-395); `modVisit` emits the same
  diagnostic. The Rust fetch loop reads pending keys via
  `std::fs::read_to_string` (scripts/vl-host/src/main.rs:151-214).
- Native diagnostics carry ONE path (the entry) — std-module errors will print
  under the entry path (accepted H3 gap).

**The LSP reads modules through the SAME `ModuleReader` seam, twice**: the TS
moduleGraph (lsp/src/moduleGraph.ts:109-119 `makeWorkspaceReader` + the graph
walks) and the wasm checker's fetch loop (lsp/src/wasmChecker.ts — `commit(key,
await read(key))`). A `std:` key must resolve in BOTH readers or the editor and
the CLI disagree.

**The seed/fixpoint flow std must not break.** The seed is assembled by
concatenating `compiler/*.vl` + the driver with import lines range-blanked
(refresh-compiler.sh, native-fixpoint.sh, build-compiler-wasm.ts);
`refresh-compiler.sh` gives a ~3s edit→seed loop.

**Generic exports are a known hole in BOTH module pipelines.** The native
rename pass skips any declaration with `<` in its name ("exporting generics is
out of phase-1 scope", vl-compiler-driver.vl:647-651); no corpus module case
imports a generic. Std collections are generic (`List<T>`), and a generic
`expect<T>` matcher needs it too — so it is its own EARLY slice here.

**What VL-the-language can already do.** Sweep 312/316; the compiler itself is
~5 modules of VL including pure-VL `i32ToStr` (compiler/ast.vl:521) — integer/
bool/string formatting is expressible in std VL today. Value unions
(`i32 | string | boolean`) compare with `==` natively (`emitUnionUnionEq`),
which D5 leans on. The remaining emitter long tail (nullable lists beyond
`i32[]|null`, map-typed params, struct-union `==`, `?.` beyond i32/boolean
leaves) is enumerated in ROADMAP; early slices stay OFF that list, collections
slices deliberately walk INTO it.

## Design

### D1. The intrinsic floor: what stays privileged, the boundary contract

The floor = `defaultScope`/typecheck.vl builtins, and ONLY these classes:
1. Builtin types and language-syntax collections (`T[]`, `{[K]:V}`) — syntax,
   not imports.
2. Host-boundary sinks: the `__print_*__` family, `__log__`/`__log_string__`,
   memory intrinsics.
3. String construction: `fromCodePoints` — strings are immutable and have no
   VL-reachable constructor below it.
4. NEW (Slice 0): `__array_new__` / `__array_new_default__` / `__array_copy__`
   per collections-design.md §LS.2 — same class as `__store_i32__`, lowered by
   name in both emitters (instructions both backends already emit internally).
5. NEW (Slice 0): `__trap__(): void` lowered to `unreachable` — the deliberate
   abort primitive `std:test`'s failure path needs. Both emitters already
   emit `unreachable` internally. (A richer `panic(msg)` can subsume it later.)

**Cost of the new intrinsics: zero.** Each is a 1:1 wrapper over a single
wasm instruction (`array.new`/`array.new_default`/`array.copy`/
`unreachable`), monomorphized per element type at the call site — the SAME
bytes both backends already emit internally for string concat/slice and list
grow. wasm-opt sees identical input to today; there is no call overhead (they
lower inline, not as functions) and no representation change. The only
performance question collections-design already answers is downstream of the
floor (a pure-VL `List` vs the builtin `T[]` lowering — measured separately
in slice 5, and `T[]` is NOT replaced in this phase).

**Failure/exception strategy: deliberately undecided here.** `__trap__` is an
ABORT (process-fatal, like Rust's `abort()`), not an exception mechanism, and
`std:test` v1 needs nothing more. The real question — Go-style error returns
(which VL's unions express today as `T | Error`) vs Rust-style `Result`+`?`
vs try/catch over the now-standardized wasm exception-handling proposal
(`exnref`), and how any of them composes with the future async/await (B12)
and streams — deserves its own deep-dive BEFORE std grows fallible APIs
(`std:fs`, parsing). Chartered as `docs/error-handling-design.md` (ROADMAP
Next); until it lands, std surfaces only total functions + `__trap__` aborts,
so nothing here pre-commits the answer.

`print` STAYS a builtin through Phase 2 (the §LS.3 migration to a `std:fmt`
dispatcher is deferred — pure churn, no new primitive).

**Contract**: std reaches DOWN to the floor only through these named
intrinsics. For Phase 2 the compiler does not import std (a program that
imports nothing compiles byte-identically to today — the H3 back-compat
invariant). May the COMPILER use std later? Other languages say yes: rustc
uses core/std, Go's compiler uses its stdlib — and VL's compiler is just a VL
program, so `wasmEmit.vl` importing `std:fmt`'s `toStr` instead of carrying
its own `i32ToStr` is the DRY end-state. What it costs: std sources join the
seed assembly + the fixpoint surface (every std edit perturbs the seed), and
the bootstrap gains an ordering rule (std must compile without importing
itself — the floor breaks the cycle, so this is satisfiable). Verdict:
allowed AFTER the module-system revisit moves the build off concatenation;
not in Phase 2, where keeping the compiler std-free keeps the seed/fixpoint
flow untouched. The one-way door is avoided: nothing in Phase 2 makes
compiler-uses-std harder later.

### D2. Resolution semantics

- **The specifier IS the key.** `std:fmt` resolves to the module key `std:fmt`
  verbatim — never a filesystem-shaped path. The reader layer owns the mapping
  to bytes. Keeps both resolvers pure string math, makes std keys unspoofable
  by user paths, and matches the H3 "fetch loop = provider query" KEEP
  decision.
- **Change in both resolvers:** specifier `std:` + a `[a-z0-9_]+(/[a-z0-9_]+)*`
  name → return verbatim; anything else keeps the unsupported-specifier
  diagnostic. Path SEGMENTS are allowed from day one (`std:test/runner` ↔
  `std/test/runner.vl`) — the validation is the same string math either way —
  but the v1 module inventory stays flat; segments exist for runner-internal
  modules and future families (`std:fs/path`-style), not as an organizing
  principle yet. Host and native diagnostic texts stay aligned with each
  other (no corpus `@error` pins the current text).
- **Unknown std module** (`std:nope`): the reader returns undefined / the host
  commits `found=0` → the existing `Cannot resolve import` path. No new
  diagnostic.
- **Std-internal imports use `std:` specifiers only.** A RELATIVE specifier
  inside a std module is an error in v1 (`dirOf("std:fmt")` is `""`, so `./x`
  would resolve CWD-relative — a confusion magnet). One guard per resolver.
- **No version/feature surface.** One std per compiler build; std's version IS
  the compiler's version.

**What belongs in std (the admission principle).** Std sits between the
compiler (maximally privileged) and user code: it is ordinary VL that ships
with the compiler, is version-locked to it, and is allowed to lean on
floor intrinsics — nothing else distinguishes it. The survey of stances:
Go (batteries-included: fmt/testing/net/http in std — ages well for servers,
poorly for everything else), Rust (lean core+std, ecosystem owns the rest —
ages well but pushes beginners to crates for basics), Deno/Zig (curated
mid-size std, explicitly versioned with the toolchain — closest to VL's
situation: no package ecosystem exists yet, so std IS the ecosystem
bootstrap). VL adopts the Deno/Zig stance with a Go-shaped floor: what goes
in is (a) what the LANGUAGE story needs to be complete without third parties
— formatting, testing, collections, and eventually fs/io/args once WASI
lands (H-M2) — and (b) what benefits from compiler version-locking (the test
runner protocol, anything the toolchain itself drives). What stays out:
anything speculative without a consumer in the tree (no `std:http` before a
network story), and anything the floor would have to grow for prematurely.
Initial inventory: `std:fmt`, `std:test` (+ `std:test/runner`), `std:list`,
`std:map`/`std:set`; first WASI-era additions: `std:fs`, `std:args`,
`std:io` — gated on the error-handling design.

### D3. Source of truth + delivery (the embedding decision)

Std source lives in a repo `std/` directory (`std/fmt.vl`, `std/test.vl`,
…), sibling to `compiler/`. `std:NAME` ↔ `std/NAME.vl`. Delivery is
per-consumer (the hybrid):

| Consumer | Mechanism |
|---|---|
| Native `vl` (build/check/run/test) | The driver lists `std:fmt` as a PENDING key like any other; the Rust fetch loop recognizes the `std:` prefix and reads `<stdDir>/fmt.vl`, where `stdDir` = `$VL_STD`, else the repo `std/` (dev tree, resolved off the exe path), else `<exe dir>/std` (release layout). ~10 lines beside main.rs:209. |
| TS CLI | Wrap `fsRead` (cli.ts:66-72): `std:` keys read from the repo `std/` dir resolved off `import.meta.url`. |
| LSP (both checkers) + playground | A GENERATED, checked-in `std/embedded.ts` (name → source map, built by `deno task gen-std`, freshness-gated by a test — the goldens pattern). One shared `withStd(read)` wrapper serves `std:` keys before consulting buffers/disk, in BOTH the TS moduleGraph and the wasm checker's reader. The browser playground (no fs) works for free. |

Explicitly NOT in Phase 2: baking std texts into `build/vl-compiler.wasm`.
Weighed: wasm-embedding makes the compiler self-contained but taxes the std
ITERATION loop (every std edit = a reseed + fixpoint perturbation) and needs a
VL-string-escaping generator inside the sed/cat seed assembly — new machinery
in the most brittle place. Std is about to become the emitter-gap discovery
vehicle; the edit loop wins. The embedded end-state remains available later
under H-M2 packaging (or `include_str!` into the Rust host at release build —
open decision OD1).

**Distribution + version skew.** Std is distributed WITH each consumer, never
separately, and is version-locked to the compiler it ships with:
- the repo/dev tree: `std/` is just files — edit, rerun, no build step;
- a released `vl` binary: carries its own std (the `<exe dir>/std` layout or
  `include_str!`, OD1) — a user never installs std independently;
- the VS Code extension: `std/embedded.ts` is generated at bundle time, so
  the extension's std matches the extension's bundled checker. SKEW: the
  extension's std may trail/lead the workspace's `vl` binary — the same skew
  the TS-vs-wasm checker already has, surfaced by the same instrument (the
  `vital.checker: both` divergence log); for a workspace WITH a `std/` dir
  (this repo), the workspace files win over the embedded map, so dogfooding
  sees edits live;
- the playground: embedded map, pinned to the deployed compiler build.

### D4. Module inventory + order

Fine-grained modules, one per concern. Sequenced so early slices stay inside
current emitter coverage and the long-tail-walking modules come once the
plumbing is trusted. Generic exports move EARLY (slice 2) because both the
matcher surface (`expect<T>`, eventually) and all collections gate on it, and
the rename walker is the riskiest code in the module bridge — land it alone.

1. **`std:fmt` v1** — pure-VL `toStr` for i32/i64/boolean (the `i32ToStr`
   technique), `padLeft`/`repeat`/`join`-class helpers. f64→string (shortest
   round-trip, Ryu-class) explicitly DEFERRED — `print` keeps covering floats.
2. **`std:test` v1** — registration + matcher surface per D5; co-designed
   with the `vl test` runner.
3. **`std:list`** — the collections-design §VL growable over the floor. The
   big demand-discovery slice.
4. **`std:map` / `std:set`** — then `std:test` v2 (generic `expect<T>` —
   structural `==` over structs/lists already works in both compilers; the
   gate is generic exports, slice 2).

### D5. `std:test` v1 — the in-language surface (the runner contract)

Decided jointly with `docs/test-runner-design.md` (where the execution model,
parallelism, and output capture live). The maintainer's direction: jest-shaped
`describe`/`it`/`beforeEach`/`afterEach`, `expect(...)` matchers over
`assert*` functions.

- **Registration, two-phase.** `describe(name, fn)` / `it(name, fn)` register
  into module-level registry lists (closures in ref lists — proven native
  coverage); the file's top level runs at instantiation (the wasm start
  function), AFTER which the registry is complete. The host then drives
  execution test-by-test through a small export protocol (`vltCount`,
  `vltNameLen/At(i)`, `vltRun(i)`, …) — per-test host calls give per-test trap
  isolation, output attribution, and filtering for free. `describe` bodies are
  REGISTRATION-ONLY (the Deno-steps lesson, documented loudly).
- **Hooks**: `beforeEach(fn)`/`afterEach(fn)` register against the enclosing
  `describe` scope; `vltRun(i)` runs the hook chain around the test. State
  flows through closure-captured module `let`s (idiomatic) — typed
  fixture-helpers (`let db = testDb()`) are the blessed pattern over DI.
- **`expect`, v1 trick — value-union matchers before generics.** To be
  precise about what gates what: VL `==` is ALREADY STRUCTURAL for structs
  and arrays in both compilers (corpus `objects/equality`, `arrays/equality`;
  the native lowering shipped — `emitStructEq` recurses fields, lists compare
  length+elements, function-valued fields by identity). The v1 limitation is
  NOT equality — it's that `expect<T>` is a GENERIC function and generic
  exports don't survive either module pipeline until slice 2. So v1 ships
  `expect(v: i32 | i64 | f64 | boolean | string)` (a value union — one
  `expect` name, no `expectI32` splay, no overloading needed) returning an
  `Expectation` struct; `.toBe(w)` compares via union `==`, `.not()` inverts,
  failure renders via `std:fmt`. `expect<T>` over structs/lists is the v2
  upgrade (after slice 2), and its `==` already works.
- **Matcher naming: one matcher, `.toBe`, meaning VL `==`.** Jest's
  `toBe`/`toEqual` split exists because JS has two equalities (identity vs
  deep). VL has ONE today — `==` is structural everywhere — so v1 has one
  matcher. If/when a referential-identity operator lands (ROADMAP A15 `===`),
  `.toBeIdentical` can join; `.toEqual` is reserved as a future alias
  decision, not v1 surface.
- **Failure contract: record-print-trap.** A failing matcher prints one
  rendered line (`FAIL <test name>: expected …, got …`), then `__trap__()` —
  the test aborts (jest semantics: a test stops at its first failed
  expectation), the host catches the trap for THAT test and continues the
  file. Under bare `vl run` (no runner) the same file still adjudicates:
  nonzero exit on first failure, exit 0 when green.
- **Source locations**: there are no runtime stack traces. v1 failure identity
  = test name (host-known) + the matcher's rendered message. The
  `#[track_caller]`-style compiler-injected call-site (`file:line` implicit
  argument on `it`/`expect`) is the chartered follow-up — highest-leverage
  testing feature in the cross-language survey, and VL owns both compilers.

### D6. LSP behavior in Phase 2

- Diagnostics/hover/completion on `std:` imports work via the `withStd`
  reader in both checkers — std source parses like any sibling.
- Go-to-definition into std: when a workspace `std/` dir exists (the repo
  case), map `std:NAME` → that file's URI; otherwise no-op. Virtual read-only
  documents are a later nicety.

## Slice plan (each slice = corpus cases + native align entries + gates)

Standing gates per slice: `deno task test` green; native sweep no bucket
regressions; `refresh-compiler.sh` + `native-fixpoint.sh` whenever
`compiler/*.vl`/the driver changed; full fixpoint on typecheck/wasmEmit
slices.

0. **The intrinsic floor**: `__array_new__`/`__array_new_default__`/
   `__array_copy__` + `__trap__` in all four places (defaultScope.ts +
   toWasm.ts; typecheck.vl + wasmEmit.vl). Corpus `tests/cases/intrinsics/`
   (@run: runtime-length alloc, fill, bulk copy incl. overlap; @trap for
   `__trap__`; @error: misuse). Independently landable (B6b's first checkbox).
1. **`std:` resolution plumbing, no std content**: both resolvers + the
   std-internal relative guard; Rust std-dir mapping; cli.ts fsRead wrap;
   `std/embedded.ts` generator + freshness test; `withStd` in moduleGraph +
   wasmChecker. Ship a trivial `std/seed.vl` to test plumbing. Corpus:
   `modules/std-basic/` (@run), `std-unknown/` (@error), `std-internal-
   relative/` (@error). LSP tests in both checkers.
2. **Generic exports through both module pipelines**: remove the driver's
   `<`-skip with real rename support; verify the host path. Corpus
   `modules/generic-export/` (@run: generic fn + generic type imported and
   instantiated; name-isolation variant). Lands alone — riskiest walker code.
3. **`std:fmt` v1**: toStr/join/pad in pure VL. Corpus `std-fmt/` pinning
   exact rendering. First expected long-tail contact; each gap files with a
   minimized corpus case.
4. **`std:test` v1 + the `vl test` runner v1** (see test-runner-design.md
   for the runner half): the D5 surface + the host protocol + discovery/
   reporting. Corpus: `modules/std-testing-pass/` (@run), `std-testing-fail/`
   (@trap). From this slice on, NEW behavioral tests are written as
   `*.test.vl` — directive-corpus growth stops.
5. **`std:list`** over the floor (heavy demand-discovery).
6. **`std:map`/`std:set`** + `std:test` v2 (generic `expect<T>`,
   struct/list matchers).

Dependencies: 0 and 1 independent; 2 independent of 3; 3 needs 1; 4 needs
0+1+3 (and wants 2 only for v2 matchers); 5 needs 0+1+2; 6 needs 5.

## Open decisions

- **OD1 — release packaging**: ship `std/` beside the binary vs `include_str!`
  into the Rust host at release build. (Dev tree unaffected either way.)
- **OD2 — `__trap__` now** vs waiting for a richer `panic(msg)`. Recommended:
  add `__trap__` now; `panic` subsumes it later.
- **OD3 — failure mode**: record-print-trap (one failure per TEST, jest
  semantics) is chosen; a collect-all-expectations mode is a v2 runner policy.
- **OD4 — LSP go-to-def into std**: workspace-`std/`-only navigation for v1.
- **OD5 — `print` stays builtin through Phase 2.**
- **OD6 — naming: RESOLVED `std:test`** (maintainer call on the PR review).
  Matchers: v1 has only `.toBe` = VL `==` (structural — see D5); the
  jest `toBe`/`toEqual` split has no meaning until a referential `===`
  exists (A15).
