# VL / Vital — Roadmap

VL is a scripting-feel language whose types are **hidden by aggressive inference**. It is
**permissive and structural**, **fully type-safe**, and compiles to **lean WebAssembly**. It ships
as three deliverables: a VS Code extension, the native `vl` CLI and an in-browser playground. The
compiler is self-hosted (`compiler/*.vl`) and compiles itself to a byte-exact fixpoint. The layout
and pipeline are in [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

This file is the entry point. It holds the direction, the ordered workstreams and a link to the doc
that owns each one. The detail lives in that doc, and each fact has one home.

> **Keeping this file honest.** This file has rotted five times, each time the same way: prose
> nothing checked, facts copied from their owning docs, done markers left in place of a deletion,
> and a ranked table carrying a date and effort units. So it is an index, and
> [`tests/roadmap_honest_test.ts`](tests/roadmap_honest_test.ts), run by `deno task test` and CI,
> reads it and the [`docs/roadmap/`](docs/roadmap/) track docs. The test fails on any of these:
> - a `D<id>` whose inventory row is closed;
> - a done marker (a check mark, strikethrough, or DONE/SHIPPED/CLOSED/LANDED as a status);
> - an effort or time estimate;
> - a relative link that does not resolve.
>
> A finished item is deleted in the PR that adds its `CHANGELOG.md` line, and a partial item keeps
> only its forward part. A new item goes in a track and reaches the ordered list only by reach.

## Where each fact lives

- **Defects:** one row each in [`docs/internals/inventory/`](docs/internals/inventory/) and
  [`inventory-2/`](docs/internals/inventory-2/). The queue is
  `vl run scripts/inventory/ls.vl -- --status open`.
- **The refactor's order and status:**
  - the target and its migration order are in
    [`architecture-target-2026-10.md`](docs/internals/architecture-target-2026-10.md) §3;
  - the plan, the acceptance rules and the status table are in
    [`architecture-refactor-plan.md`](docs/internals/architecture-refactor-plan.md).
- **Questions for the owner:** [`open-rulings.md`](docs/internals/open-rulings.md), the single
  questions file. The spec's own questions are in [`OPEN-QUESTIONS.md`](docs/spec/OPEN-QUESTIONS.md).
- **Consumer asks:** each consumer's own doc, listed under Consumers below.
- **Finished work:** [`CHANGELOG.md`](CHANGELOG.md). **Non-obvious rationale:** [`DECISIONS.md`](DECISIONS.md).

## Next, in order

1. **The architecture migration**, in [target §3](docs/internals/architecture-target-2026-10.md)
   order. The forward items after the latest landings are in §3.1, "Open after #5061". Status is in
   [the plan](docs/internals/architecture-refactor-plan.md).
2. **Clause-1 defects:** D13960 (a wider record list spread into a narrower rest parameter is
   check-clean invalid wasm). For the rest, run `ls.vl -- --status open` and grep for `clause 1`.
3. **Initialization order** (DECISIONS.md, "Initialization order"). Make init-before-read a compile
   error and reorder initializers. D14361 is open beside it.
4. **Generated-code performance:**
   - print imports only when reachable;
   - B-range (D4000);
   - L10;
   - B-hint.

   All four are in [Track B](docs/roadmap/track-b-codegen.md).
5. **Reference identity and equality (A15)**, after the owner reconfirms the ruling. See
   [Track A](docs/roadmap/track-a-types.md).
6. **Width subtyping, the container half**, in [Track A](docs/roadmap/track-a-types.md).
7. **Struct keys for `Map`/`Set` (A15.2)**, in [Track A](docs/roadmap/track-a-types.md).
8. **`Buf` memory safety:** fix or accept (open-rulings §E,
   [Track B](docs/roadmap/track-b-codegen.md)).
9. **Undeclared-identifier "did you mean"**, in [Track A](docs/roadmap/track-a-types.md).
10. **`docs/guide/soundness.md` fixes**, in [Track A](docs/roadmap/track-a-types.md).

## Parked: ruled low priority, or built on ask

- `vl test --trace` inline run values, and `vl compile` to a standalone executable.
- A-LISTAS: list `as` conversion (`b as K[]`), until someone asks.
- SIMD f64x2 and relaxed SIMD, when a consumer asks (SIMD/threads ruling).
- A build-configuration surface (`std:build`), only if users need build-dependent code.
  `__memory_shared__` stays std-internal.
- A15.5: a lazy i64 serial for identity hashing, only if a program measures the flat scan as a
  problem.
- Deferred import forms: import maps, namespace and default imports, and export-all.
- Non-asks that stand:
  - exceptions and async;
  - separate compilation and wasm linking;
  - WASI;
  - in-language GC knobs.

## Consumers

Each consumer keeps its own list. Re-run an ask before scheduling it.
- **webcraft:** `~/webcraft/docs/design/vl-requirements.md`, and in-repo
  [`docs/webcraft-requirements.md`](docs/webcraft-requirements.md).
- **plumb:** `~/plumb/docs/vl-issues.md`. Queued: std wrappers over the shared-memory and atomics
  intrinsics, and raw integer SIMD intrinsics, each through std-api-reviewer.
- **veldt and sunsuz:** these are on ask only.
  - SIMD S4: integer and byte shapes (`I32x4`, `U8x16`, ...) in `std:simd`.
  - `flat` sub-byte fields and newtypes over byte widths (flat-records-design.md §11.3).
- **sunpa:** `~/sunpa/docs/vl-issues.md`. Two asks, both std API changes (std-api-reviewer, owner
  first), which may fall outside sunpa's scope directive:
  - `std:test` boolean matchers take no message;
  - `vl test` has no per-test time (an opt-in `--durations`).
- **diderven** (chief user): `~/diderven/docs/vl-issues.md`. DV-1000 is B-range.
- **eardstap:** `~/eardstap/docs/vl-issues.md`. **heregeat:** `~/heregeat/docs/vl-issues.md`.
- **emoji-sheep-tag:** it has no doc of its own; its feedback is in
  [Track B](docs/roadmap/track-b-codegen.md).

## Tracks

- **Track A, the type system:** [`docs/roadmap/track-a-types.md`](docs/roadmap/track-a-types.md).
- **Track B, codegen, the memory model and the runtime:**
  [`docs/roadmap/track-b-codegen.md`](docs/roadmap/track-b-codegen.md).

### Track C — CLI

- **C5, distribution.** `release.yml` and `Formula/vl.rb` are drafts. The publish job, a release tag,
  the brew tap and the sha256 bump remain, and they wait on the owner.
- **C-test-cache.** It is built opt-in. Two things remain:
  - the owner's call on flipping the default once the trial ends (`VL_NO_COMPILE_CACHE`,
    `--no-cache`, `vl cache clean`);
  - the `VERIFY=sample:N` mode.
- **C-incremental**, in [`incremental-compilation-design.md`](docs/internals/incremental-compilation-design.md):
  - S5 is in progress, S3 `--watch` and S6 are not started, and S4 is ongoing;
  - Q2 and Q3 wait on the owner;
  - the check-skip's residual declines (27 of 30 replayed commits served).
- **C-extern-read.** `vl run` refuses every declared extern global, even one that only an imported
  module declares and nothing reads. The goal is to refuse only a global that reachable code reads or
  writes.
- **C-ci-compile.** The cross-program checked-form cache (perf-opportunities-2026-09.md §B1) would
  remove the per-file std re-check that dominates `vl_check_codegen_test.ts`. Re-measure first.
- **`vl test` follow-ups:**
  - f64 failure rendering;
  - per-test timings and timeouts;
  - `--no-capture`;
  - dot and json reporters;
  - structural diffs;
  - power-assert rewriting.

### Track D — LSP and editor

- Completion and hover for the members a bound grants on `x: T` (`<T: Showable>`).
- UFCS completion offers a workspace `f(self: T, ...)` only from a module already in the graph.
- **Lossless recovery, stage 2.** Convert the remaining lossy skip sites one at a time. Each one makes
  the recovery faithful and deletes its pin from `tests/vl_lossless_recovery_test.ts` (DECISIONS.md,
  "A recovered parse IS typechecked").
- Hover for `Map`/`Set` members is unverified.
- **Formatter.** `type` alias bodies are printed verbatim from the source span. Method-shorthand and
  the index and operator call desugars are not probed.
- **AST type-syntax fidelity.** Keep the as-written type syntax, or its span, so the AST is lossless
  for types.
- **Unused-export hints** at struct-field level. They are owner-gated, and fuzzy under structural typing.
- **The hover verbosity stepper** waits on vscode-languageserver shipping the 3.18 hover-verbosity
  API. The renderer's `maxDepth` is ready.
- Not queued until a consumer asks: workspace symbols, DAP, notebooks, monikers and call hierarchy.

### Track E — Browser playground

- **E3, sandboxed execution.** Run user wasm in a Web Worker with a fresh `Memory`, log-only imports
  and time or step limits, so that a long-running or trapping program cannot freeze the editor. It is
  required before any public deploy. The code is in `playground/src/{runtime,playground,main}.ts`.

### Track F — Infrastructure

- **Dogfooding** (standing order). Shell scripts that still do work a VL program can do include
  `gate.sh`, `fuzz-vl.sh` and `refresh-compiler.sh`. `fuzz-vl.sh` rewrites `fuzzgen.vl`'s `RICHVALUES`
  by `sed`, and should pass it as an argument instead. The host-ABI gaps are the `dogfood:` rulings in
  open-rulings.md.
- **F9.** No wall-time baseline for `vl build` or `vl run` is tracked. Seed size, generated-code cost
  and scaling shape are.
- **F-tiers.** The corpus oracle is not redundant (#2950). Moving emitted-wasm execution from V8 to
  the native runner is J1.
- **Compiler cleanup.** Hand-written bulk-append loops in `compiler/` and `std/` are each
  `dst.push(...src)`. Migrating them changes compiler bytes, so it needs its own identity proof.
  Re-derive the count with a script before briefing.

### Track H — Self-hosting and distribution

- **H3, merge-by-renaming**, is a bridge (native-modules-design.md, "Post-parity revisit"). The
  resolve phase (`identDeclIx`) likely supersedes it.
- **H-M2, wasm-native distribution.** Retire the Rust host by emitting WASI p1, linear memory and
  GC-string copies, and run under a stock wasmtime. It is secondary to the refactor.

### Track J — Retire Deno

This track is secondary to the architecture refactor. Shrink the TS over time.
- **J1.** Twelve test files execute emitted wasm under V8 via `support/runWasm.ts`. Move them to the
  native runner.
- **J2.** The behavioural corpus is still driven from Deno. Which runner hosts the surviving JS-side
  tests is an open ruling.
- **J3.** Six `scripts/*.ts` remain. Port each to VL or delete it:
  - gen-std;
  - shared-instance-probe;
  - probe-rollback-census;
  - perf/lsp-keystroke;
  - perf/oracle-abi-probe;
  - std-math/run-v8.
- **J4.** The LSP bundle is `npx esbuild` plus `bundle-seed.ts`. The playground bundler
  (`playground/build.ts`) is still esbuild under Deno.
- **J6.** Delete `deno.json`, `deno.lock` and the setup-deno steps once J1–J4 land.
