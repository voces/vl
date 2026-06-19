# Self-host `print` emission — implementation plan (H3 / the `@run` oracle unlock)

The next big rock after corpus verdict-conformance (255/422): make `wasmEmit.vl`
emit `print(x)`, so the 310 `@run` corpus files can run through the VL pipeline and
their logs diff against the `@log` directives — the **runtime VL≡TS oracle** — and
`vl build` output becomes genuinely runnable. This doc captures the verified
contract and the staging so the implementation can start cold.

## The host contract (verified against `compile.ts` / `wasmBuiltins.ts`)

- Import MODULE name: `"imports"`.
- Imports backing `print` (all `(param)->()`):
  - `__print_i32__ (i32)` — also used for plain i32 prints
  - `__print_bool__ (i32)` — host renders `true`/`false`
  - `__print_char__ (i32)` — streams ONE code point of a string
  - `__print_str_flush__ ()` — emits the accumulated line
  - (`__print_i64__/f32/f64` exist but are out of the self-host subset)
- `runWasm` (`compile.ts:770`) provides exactly these under `{ imports: { … } }`.
- A string prints by streaming each code point through `__print_char__` then one
  `__print_str_flush__` (the host compiler emits a `__print_string__` helper; the
  self-host emitter can lower the loop INLINE with its existing string scratch).

## The index-shift inventory (the risky part)

Imported functions occupy function indices `0..nImports-1`; every LOCAL function
shifts by `nImports`. When `print` is unused, NO import section is emitted and
nothing shifts — **the 14 goldens are print-free, so they stay byte-identical by
construction**. With prints, the following must all offset:

1. `buildFnMap` — `fnIndices[i] = i` becomes `i + nImports` (single assignment).
2. The export section — exports map name → function index (re-check whether it
   reads `fnIndices` or recomputes positions; `wasmEmit.vl:6044` region).
3. The start section — `startFnIdx = n` becomes `n + nImports`.
4. `fbCall` call sites all flow through `fnIndices` (one offset point), but verify
   the `emitStartFnCode`/helper-call paths don't hardcode indices.
5. The FUNCTION section count stays `n` (imports are not in it), but the TYPE
   section gains the import functypes (see below) and the IMPORT section (id 2)
   slots between type (1) and function (3).

## Type-section entries

Two new functypes when printing: `(i32)->()` and `()->()`. The functype interning
lives in the `emitTypes` region (`wasmEmit.vl:5815-5930`, `typeOffset`). The import
section references functype indices, so these intern through the SAME mechanism
(append after user functypes; order canonical: i32-param first, then nullary).

## Lowering `print(x)` (emit path)

In the Call lowering, callee Ident `"print"` (check BEFORE `fnIndexOf`, like the
existing builtin special-cases at `wasmEmit.vl:3966-3980`):
- arg statically i32/bool (the existing `exprString`/valtype classification):
  emit arg, `call __print_i32__` (or `__print_bool__` when the checker/annotation
  says boolean — the self-host subset can start with `__print_i32__` for both and
  upgrade once bool-ness is threaded; NOTE the corpus `@log true` files then
  mismatch, so bool detection matters for those files' logs).
- arg string-typed (`exprString` already classifies): loop `i = 0..len`,
  `array.get` the code point, `call __print_char__`, then `call __print_str_flush__`
  — reuse the string-op scratch frame (receiver ref + i32 cursor + len).
- anything else: `emitFail` (clean diagnostic).

## Staging (each step golden-gated)

1. Plumb `nImports` (0 default) through `emitModule`: import section emission,
   index offsets, functype interning — with a HARD assertion that `nImports == 0`
   produces byte-identical output (run the golden + fixpoint tests).
2. Detect print usage (AST pre-pass over Call/Ident like `collectFns`), set
   `nImports = 4`, emit the import section; lower `print(i32)`.
3. `print(string)` inline loop; `print(bool)` via the checker-known type or the
   annotation (bool rides in i32 — the EMITTER needs the boolean-ness; thread it
   the way `exprString` threads string-ness).
4. The runtime harness: `tests/selfhost_corpus_run_test.ts` — drive whitelisted
   `@run` files through lexer→parser→typecheck→emitProgram in ONE compiled module
   (the existing compile-once pattern), instantiate each result with the
   `runWasm`-shaped import object, collect logs, and diff against the file's
   ordered `@log` directives. The whitelist grows the same sweep-promote way.

## Risks

- Index drift = invalid wasm or wrong call targets; the golden suite catches the
  former instantly, the fixpoint the latter (`SELFHOST_FULL_FIXPOINT=1` before
  merging this).
- Bool-vs-i32 print selection changes LOG TEXT (`true` vs `1`): files asserting
  `@log true` need real bool detection (step 3), not a shortcut.
- The start-function interaction (non-const globals) — `startFnIdx` must offset.
