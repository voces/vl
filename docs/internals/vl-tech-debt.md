# VL tech-debt — remaining work

Cleanups and limitations that are deferred but not yet done. Each entry: what is
missing today and the direction to close it. Remaining work only — resolved items
live in `CHANGELOG.md` and the tests that pin them.

Organized by area. Triage freely.

---

## Self-host migration (kill-TS)

- **Self-host test glue duplicates the lexer rename.** Multiple `selfhost_*_test.ts`
  files independently `sed`/`.replace()` the lexer's `Tok`/`Diag`/`advance` names to
  de-collide when concatenating modules (no module system in the test driver path).
  The same rename lives in `refresh-compiler.sh` and `native-fixpoint.sh`. One shared
  helper would remove the copy-paste and the risk of them drifting.

## Inference cleanup (lean on types — remove redundant annotations)

VL hides types and surfaces them only where required; the `redundant-type` lint +
`--fix` strips explicit annotations the compiler already infers. Remaining follow-ups,
in order of safety:

- **Redundant RETURN-type annotations — wider return shapes.** The rule flags +
  `--fix`-removes a `function f(): T { … }` whose inferred return is exactly `T`,
  scoped to scalar / string / `i32[]` / `string[]` returns of non-generic functions.
  Not yet supported: **`f64[]`, ref-array (`T[]`), union, and nullable returns** stay
  annotated — each needs its own classifier + result-valtype wiring (and a ref-array's
  element wrapper is a per-function slot, unlike the singleton string/i32 lists).
  Genuinely-required annotations that stay regardless: base-case-less inferred cycles
  (`cannot infer`) and object returns (structural emit identity).
- **Inferred union / nullable / niche returns.** Return-type inference joins all
  returns and the emitter lowers the value-union and nullable-scalar cases
  un-annotated. Not yet supported, still floored with `cannot infer a {union,nullable}
  return type — annotate it`:
  - a union of STRUCT refs (`{…} | {…}`) — needs the variant-boxed ref rep + tag
    assignment from the inferred members, not the value box.
  - inferred (un-annotated) `boolean | null` / `string | null` NICHE returns — the
    emitter's inferred-return classifier carries the value-union box seed but not the
    niche seed (the niche encoding is a sentinel, not the box), so these still require
    an explicit annotation. Closing it = thread the inferred niche structure (not just
    the value-atom name) to the return-site seeding.
- **`??` on a non-Ident left operand.** `??` is supported only when the left operand
  is a plain identifier or a map-index get; `f(x) ?? d` (a call/expression LHS) fails
  `` `??` is only supported on a map index get ``. A call LHS would re-evaluate, so it
  needs a scratch local to bind the result once. Workaround: `const r = f(x); r ?? d`.
- **`emitExprAsF64`/`F32`/`I64` don't recognize a closure `call_ref` as already-typed.**
  A tail/return whose value is a closure call returning f64/f32/i64 (`apply(addf, …)`)
  isn't classified by `exprIsF64`/etc. (the `Call` case only handles a direct-Ident
  callee, not a `call_ref`), so the numeric widening would mis-convert it. Worked around
  in `emitReturnValue` (the implicit-return tail passes `widenNum=false`), which also
  means an i32-literal in an `f64`/`i64`-returning TAIL (`function f(): f64 { 5 }`) is not
  widened. Real fix: teach `exprIsF64`/`exprIsF32`/`exprIsI64` to resolve a closure
  call's return type, so the widen helpers are correctly idempotent.
- **Redundant PARAMETER annotations.** Removing a param annotation can turn a
  monomorphic function generic (a real semantic change: it changes
  overload/monomorphization behavior, not just a type label). Only safe under much
  stricter conditions (e.g. a non-exported function whose every call site pins the same
  concrete type, and where leaving it inferred wouldn't widen). Treat as its own design
  note before implementing.

## Formatter

- **`vl fmt -w` ≠ `vl fmt --check` on long single-line `if/else`.** `vl fmt -w` is a
  no-op (idempotent) on a long single-line `if cond { a = x } else { a = y }` that
  exceeds the wrap width, yet `vl fmt --check` rejects it (`not formatted`, exit 1) —
  so "I ran `fmt -w`" does not imply `--check` passes, and the CI fmt gate fails.
  Workaround: break such statements onto multiple lines by hand. Real fix: make the
  rewrite path wrap the same constructs the check path demands (one formatter, one
  canonical form). (Recorded in agent memory `vl-fmt-self-lint-before-push`.)
- **Surface divergences from the host (quality, not soundness).** Two cases where
  `format.vl` canonicalizes where the host preserves, both semantics-preserving (they
  pass the round-trip oracle, so they don't break a guarantee — the self-host formatter
  is idempotent / AST round-trip / comment-preserving, validated by `vl fmt --check` in
  CI): (a) object-literal METHOD SHORTHAND `add(a, b) { … }` is expanded to
  `add: function(a, b) { … }`; (b) `format.vl` does not collapse short `else if` chains
  onto one line the way the host can. Both would need addressing for byte-for-byte
  parity if that ever becomes a requirement. (Param-colon spacing `a:i32`→`a: i32` is
  intentional canonicalization, not debt.)

## Known bugs carried as debt

- **Builtin-type hover renders `i32: i32`.** Hovering a builtin TYPE name (`i32`,
  `f64`, `boolean`, `string`, …) in any position shows `i32: i32` — silly. The hover
  chain ends in a builtin fallback that finds the word in `builtinCompletions()` and
  renders `${word}: ${detail}`; for a builtin TYPE the `detail` IS the type name, so
  name and type coincide. Fix: when the matched builtin is a TYPE (kind 0), render just
  the name (or `type i32`) instead of `name: type`. Same for a user `type` alias whose
  body renders to its own name. Minor cosmetic; affects extension + playground.
- **native capScan shadowing bug.** A local `let` shadowing a same-named top-level
  function breaks a lambda's capture analysis. Forces awkward renames in `.vl` source —
  debt paid in workarounds until the fix lands.
- **No `///` doc-comments on wasm-mode hover/completion.** The native symbol query
  exposes a binding's type but not its authored `///` doc comment, so hover renders
  `name: type` with no doc panel and completion items carry no `documentation`. Closing
  it needs a native doc-comment export (the lexer already retains `//`/`///` as trivia —
  a `docAt(line,col)` could associate the leading doc run with the binding/decl under
  the cursor) plus re-plumbing the xref resolver off the native import graph.
- **Cross-module completion scope leak (`symScopeAt`).** In a multi-module compile the
  merge concatenates every module's tokens into one stream but each keeps its OWN
  per-module line numbers, and all top-level decls flatten into one global scope — the
  import boundaries are lost. So `scopeAt` (LSP completion) at a cursor in the entry
  file can surface a DEPENDENCY's nested params/locals whose per-module line span
  happens to overlap the cursor's line. A naive entry-module filter doesn't work: a
  legitimately-imported top-level name and a dep-internal local both have their decl in
  the dependency module, and a global-scope filter would instead leak TRANSITIVE deps'
  top-level names the entry can't reference. A correct fix needs the merge to preserve
  each module's import set + scope chain (global token coordinates, or per-module-tagged
  vis spans with an import-visibility check) rather than a flat global scope. Def/refs/
  hover are unaffected — they disambiguate by module tag (`symOccModuleAt`).

- **`tyToStr` is a DIAGNOSTIC renderer doing an ANNOTATION renderer's job.** Every type
  the editor shows — inlay labels, hover bodies, completion details — is `tyToStr`
  output, and its own header says "type → string (for diagnostics)". But those surfaces
  are annotation-shaped: an inlay hint is formatted `: T` (a suggestion of the
  annotation to write) and a hover is fenced as a `vital` code block (a claim the text
  is VL). So the renderer's give-up markers and internal names leak into positions that
  imply the user could type them. The host now filters the three ABSENCE markers
  (`<error>`/`<none>`/`<?>`, via `isDisplayableType` in `lsp/src/typeFeatures.ts`) —
  measured 0 sightings on diagnostic-free corpus files, so the filter is confined to
  broken code. **`…` is deliberately NOT filtered** (45 clean sightings — the depth cap
  on legitimately deep recursive types; it means a type is PRESENT but elided).
  Remaining: the HOLE marker still reaches the editor. It renders a `?fn.N` inference
  hole and cannot be filtered host-side without deleting informative hints from healthy
  code (`: _[]`, `: {x: _, y: _}`, 88 clean corpus labels). It is spelled `_` rather than
  `any` precisely so an unfilterable marker does not read as a writable type name, but a
  hint is formatted `: T` (a suggestion of the annotation to write) and `_` is not
  writable either. The remaining fix is a separate DISPLAY renderer that spells a hole as
  a type parameter (`T`, `U` — which VL can actually write, and which preserves the
  distinctness a single marker destroys), leaving `tyToStr` alone for error messages.

- **`inlayHole` is shallow, and `check_state.vl`'s header says otherwise.** The comment
  at `check_state.vl` ("A type that's still an inference hole … is skipped") is true
  only of a TOP-LEVEL hole: `inlayHole` (`typecheck.vl`) tests one arena node, so a
  `TyUnion` whose members are all holes passes the guard and a return hint renders
  `_ | _` — two DISTINCT holes (`?f.0`, `?f.1`) that the renderer prints
  identically. This is the owner-reported defect. A validated four-line union arm on
  `inlayHole` (probe-built and measured: corpus inlay hints 4,249 → 4,207, unspellable
  labels 110 → 74, all 36 removed being all-holes unions, `: _ | string` and
  `: {foo: _, bar: _}` both preserved, diagnostics unchanged) is filed with the
  `typecheck.vl` owner. NB the union case should be skipped for the same reason the
  scalar case already is — a lone hole return renders no hint today.

- **A function whose parameter annotation fails to resolve can still get a confident
  return hint.** `function f(v: {foo: string} | {bar: any}) { if v is {foo: string} {
  return v.foo }; return v.bar }` — the annotation does not resolve (`any` is not a VL
  type), yet the `is`-narrowed arm supplies `string` and the editor offers `: string`.
  Root: in the return-inference join, `inferObserved >= 0` wins over `inferSawErr`, so
  error-typed arms are dropped rather than poisoning the result.

- **The return-inference cascade guard misses the unresolvable-annotation case.**
  `paramUninferable` exists to suppress a redundant "cannot infer a return type" once a
  parameter already reported its own root cause, but it is set ONLY for an anonymous
  lambda param with no annotation and no contextual type. A named function whose
  written annotation fails to RESOLVE reports both `unknown type '…'` and the return
  message. Measured one variable apart, all three of `v: any`, `v: {bar: any}`,
  `v: {foo: string} | {bar: any}` behave identically — the message count tracks the
  presence of an `is` guard, NOT the annotation's nesting depth.

## Test infrastructure

- **Per-file isolation vs wasm traps.** `runWasm` rethrows on trap and drops the
  partial `logs`, so a corpus-wide self-host driver that traps on one file loses all
  output and can't point at the culprit. Harnesses work around it with custom
  trap-capturing instantiation / bisection. A shared "run and capture partial logs"
  helper would remove the per-harness reinvention.

---

_Add entries as you defer cleanups. Keep it honest, and keep it green — a documented
limitation is still debt, but a resolved one belongs in `CHANGELOG.md`, not here._
