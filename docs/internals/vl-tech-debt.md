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

## Test infrastructure

- **Per-file isolation vs wasm traps.** `runWasm` rethrows on trap and drops the
  partial `logs`, so a corpus-wide self-host driver that traps on one file loses all
  output and can't point at the culprit. Harnesses work around it with custom
  trap-capturing instantiation / bisection. A shared "run and capture partial logs"
  helper would remove the per-harness reinvention.

---

_Add entries as you defer cleanups. Keep it honest, and keep it green — a documented
limitation is still debt, but a resolved one belongs in `CHANGELOG.md`, not here._
