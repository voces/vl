# VL tech-debt log

A running ledger of debt accrued while pushing features (especially the kill-TS /
self-host migration). New code has outpaced refactoring; this file is where we
write down the cleanups we're deferring so they don't get lost. Each entry: what
the debt is, why it exists, and the cleanup direction. `[PAID #N]` marks resolved
items (kept for the record); everything else is open.

Organized by area. Triage freely.

---

## Self-host migration (kill-TS)

- **Native checker diagnostic-span polish (ex-parity residuals).** When the TS
  checker + its parity sweep were retired, the native checker was at accept/reject
  VERDICT parity over the single-file corpus (456 files) — but 81 STRUCTURAL
  divergences remained vs the frozen TS reference, none a verdict disagreement (no
  program native accepts that TS rejected, or vice versa). Breakdown: **74
  span-only** — both emit the same error count, the native caret sits at a different
  column, often a BETTER one (e.g. `&` integer-only anchored at the operand; `cannot
  infer` at the binding's use); **4 where native is STRICTER** — it catches an error
  frozen-TS missed (native is correct); **3 where TS emits an extra secondary/cascade
  diagnostic on a file both reject** (`trailing-comma-illegal`, `err-bad-hex-digit`,
  `soundness/not-is-guard-no-divergence-no-narrow` — native reports 1 of 2; the
  rejection stands). These are diagnostic ergonomics, not soundness. The native
  checker is the spec now, so "match the TS span" is no longer the goal — fix a span
  or wording only where it is genuinely worse. (The full bucket list lived in
  `/tmp/checker-parity.txt`, regenerable only while a TS checker existed; this entry
  is the durable record.)
- **Formatter divergences documented as "limits, not bugs."** `compiler/format.vl`
  header lists three intentional divergences from `format.ts` (kept `Paren` nodes,
  desugared `a += b`, un-ported verbatim fallback). `[MOSTLY PAID]` — the
  full-corpus parity pass reconciled the real divergences — now mostly via faithful
  AST markers rather than token recovery: compound assign `+=` and `++`/`--`
  (`binCompound`), `!is` (`IsExpr.isNeg`); `elseif` was dropped as a redundant alias
  of `else if`. Token recovery remains only for quoted operator/index-trap object
  keys (`"[]"`, `"*"`), the `export` modifier, and `import` re-emission. The
  self-host formatter now upholds all three guarantees (idempotent / AST round-trip
  / comment-preserving) over 477/477 host-parseable corpus files
  (`tests/selfhost_format_corpus_test.ts`). Residual, non-guarantee-breaking
  surface divergences from the host (see below) remain.
- **Residual formatter surface divergences from the host (quality, not soundness).**
  Two known cases where `format.vl` canonicalizes where `format.ts` preserves, both
  semantics-preserving (pass the round-trip oracle) so not caught by the corpus
  test: (a) object-literal METHOD SHORTHAND `add(a, b) { … }` is expanded to
  `add: function(a, b) { … }`; (b) `format.vl` does not collapse short `else if`
  chains onto one line the way the host can. Neither breaks a guarantee; both would
  need addressing for byte-for-byte parity if that ever becomes a requirement.
  Tracked so they aren't mistaken for done. (Param-colon spacing `a:i32`→`a: i32`
  is intentional canonicalization, not debt — it's an improvement over the host.)
- **Self-host test glue duplicates the lexer rename.** Multiple `selfhost_*_test.ts`
  files independently `sed`/`.replace()` the lexer's `Tok`/`Diag`/`advance` names to
  de-collide when concatenating modules (no module system in the test driver path).
  The same rename lives in `refresh-compiler.sh`, `native-fixpoint.sh`, and several
  tests. One shared helper would remove the copy-paste and the risk of them drifting.

## Inference cleanup (lean on types — remove redundant annotations)

VL hides types and surfaces them only where required; the `redundant-type` lint +
`--fix` (→ `CHANGELOG.md`) is the first rule of a family that strips explicit
annotations the compiler already infers. Shipped: redundant LOCAL-variable
annotations (`let`/`const`). Follow-ups, in order of safety:

- **Multi-module attribution + module-aware `--fix`.** `[DONE]` Each finding records
  its module (`redunModuleAt`), so `vl check`/`--fix` report + fix only the entry
  module's; `--fix` runs AFTER the resolved module compile (reliable types). Applied
  to the compiler (`−150` annotations, byte-identical seed). LSP surfacing of the
  hint could ride the same `redunModuleAt` filter (not yet wired).
- **Redundant RETURN-type annotations.** `[MOSTLY PAID]` `function f(): T { … }` whose
  body's inferred return is exactly `T` is flagged + `--fix`-removed; `vl check --fix
  compiler/ std/` dropped **1180** of them (byte-identical seed). It took THREE
  enablers, each a first-cut breakage: removing an annotation makes the function
  inferred, and the inference/codegen had to keep up — `A18` (order-independent module
  scope; a body could not resolve a global declared later), `A19` (binding-group
  recursive inference; a return through a mutual-recursion cycle inferred `void`), and
  `A20` (the emitter re-derived an un-annotated string/variable return from the
  expression and crashed codegen). The rule is now scoped to SCALAR/STRING returns of
  NON-generic functions — the categories `A20` + the emitter default lower safely.
  `i32[]` returns now CLASSIFIED too (`A20` widened: checker exports the inferred
  `i32[]` name, emitter maps it to `fRetArr`); the compiler-wide apply of those (~22)
  bootstrapped on that seed in a separate step. `string[]` returns now CLASSIFIED too
  — the earlier worry that `string` being internally `{[i32]:i32}` forced a
  per-function ref-list slot was WRONG: `string[]` lowers to the same module-global
  string-list wrapper (`mkListIdx`, valtype kind 7) the annotated path uses, so the
  only gap was the un-annotated function-SIGNATURE result valtype (it handled
  `fRetStr/Arr/Uni/Ref/Nul/RArr` but not `fRetStrArr`, falling back to an i32 result
  and trapping on a caller's index). Checker exports the inferred `string[]` name,
  emitter sets `fRetStrArr` + the signature path maps it to kind 7; the apply of those
  (7) bootstraps on that seed in a separate step. REMAINING follow-up:
  **`f64[]`, ref-array (`T[]`), union, and nullable returns** (kept annotated) — each
  needs its own classifier/result-valtype wiring (and a ref-array's element wrapper is
  a per-function slot, unlike the singleton string/i32 lists). Genuinely-required
  annotations that stay regardless: base-case-less inferred cycles (`cannot infer`)
  and object returns (structural emit identity).
- **Lower the REMAINING inferred union returns (struct-ref unions + niches).** `[A-infer-return-join MOSTLY PAID]`
  Return-type inference JOINS all returns (`i32 | null` / `i32 | string`, was
  first-wins), and the emitter now LOWERS the VALUE-union / nullable-scalar cases
  un-annotated end-to-end — driven from the checker's exported inferred name through
  `registerValueUnionName` → `fRetUni` → `emitUnionCoerce` → `unionNameOfExpr` (the
  same path an annotation takes; `isValueUnionName` is the gate). REMAINING (still
  floored with `cannot infer a {union,nullable} return type — annotate it`): a union of
  STRUCT refs (`{…} | {…}` — needs the variant-boxed ref rep + tag assignment from the
  inferred members, not the value box) and the `boolean | null` / `string | null`
  NICHE reps (`isValueUnionName` excludes them — the niche encoding is a sentinel, not
  the box). Closing those = thread the inferred variant/niche structure (not just the
  value-atom name) to the emitter's variant-box / niche return seeding. SEPARATE
  nullable-scalar codegen holes, independent of return inference: an `if … else …`
  EXPRESSION in TAIL position with a `null` branch (`{ if b { 5 } else { null } }`)
  fails `unsupported statement in body` even ANNOTATED; and `??` on a nullable SCALAR
  fails `` `??` is only supported on a map index get ``.
- **Nullable-value-type arc — `??`-over-niche, non-Ident `??`, if-else-null-tail.**
  (`boolean | null` and `string | null` value types themselves now work — see
  `CHANGELOG.md`.) Remaining: **`??` over a niche value** (`r ?? d` for `boolean|null` /
  `string|null`) and the **non-Ident `??`** (`f() ?? d` needs a scratch local — the
  value-union-box `??` only handles a re-readable Ident/field place today); the
  **`if/else`-expression tail with a `null` branch** (`{ if b { 5 } else { null } }`
  fails `unsupported statement in body` even ANNOTATED); and the **INFERRED
  (un-annotated) `boolean | null` / `string | null` return** (the checker's
  `valueUnionRetName` excludes the niche/ref reps, so it hits the robustness floor —
  extend it + the inferRet export to carry the name to the return-site seeding).
- **`vl fmt -w` ≠ `vl fmt --check` on long single-line `if/else`.** `vl fmt -w` is a
  no-op (idempotent) on a long single-line `if cond { a = x } else { a = y }` that
  exceeds the wrap width, yet `vl fmt --check` rejects it (`not formatted`, exit 1) —
  so "I ran `fmt -w`" does not imply `--check` passes, and `ci-native`'s fmt gate
  fails. Workaround: break such statements onto multiple lines by hand. Real fix: make
  the rewrite path wrap the same constructs the check path demands (one formatter, one
  canonical form). (Recorded in agent memory `vl-fmt-self-lint-before-push`.)
- **Redundant PARAMETER annotations — last, and carefully.** Removing a param
  annotation can turn a monomorphic function generic (a real semantic change: it
  changes overload/monomorphization behavior, not just a type label). Only safe
  under much stricter conditions (e.g. a non-exported function whose every call site
  pins the same concrete type, and where leaving it inferred wouldn't widen). Treat
  as its own design note before implementing.

## Known bugs carried as debt

- **Builtin-type hover renders `i32: i32`.** Hovering a builtin TYPE name (`i32`,
  `f64`, `boolean`, `string`, …) in any position shows `i32: i32` — silly. The
  hover chain (`server.ts` `onHover` / `lspAdapter.hover`) ends in a builtin
  fallback that finds the word in `wasmChecker.builtinCompletions()` and renders
  `${word}: ${detail}`; for a builtin TYPE the `detail` IS the type name, so name
  and type coincide. Fix: when the matched builtin is a TYPE (kind 0), render just
  the name (or `type i32`) instead of `name: type`. Same for a user `type` alias
  whose body renders to its own name. Minor cosmetic; affects extension + playground.
- **native capScan shadowing bug.** A local `let` shadowing a same-named top-level
  function breaks a lambda's capture analysis (branch `claude/capscan-shadow-fix`).
  Forces awkward renames in `.vl` source — debt paid in workarounds until the fix
  lands.
- **No `///` doc-comments on wasm-mode hover/completion.** The native symbol
  query exposes a binding's type but not its authored `///` doc comment, so
  `"wasm"`-mode hover renders `name: type` with no doc panel and completion items
  carry no `documentation` (the TS path's `docMarkdown` + xref linkification). This
  has been the wasm-mode behaviour since hover/completion went wasm-primary (the
  native path always returned first); now that those handlers are formally
  TS-free, the docs won't return via fallback. Closing it needs a native
  doc-comment export (the lexer already retains `//`/`///` as trivia — a
  `docAt(line,col)` could associate the leading doc run with the binding/decl
  under the cursor) plus re-plumbing the xref resolver off the native import graph.
- **Cross-module completion scope leak (`symScopeAt`).** In a multi-module compile
  the merge concatenates every module's tokens into one stream but each keeps its
  OWN per-module line numbers, and all top-level decls flatten into one global
  scope — the import boundaries are lost. So `scopeAt` (LSP completion) at a cursor
  in the entry file can surface a DEPENDENCY's nested params/locals whose
  per-module line span happens to overlap the cursor's line (e.g. importing `util`
  leaks `util`'s function params into the entry's completion list). A naive
  entry-module filter doesn't work: a legitimately-imported top-level name and a
  dep-internal local both have their decl in the dependency module, and a
  global-scope filter would instead leak TRANSITIVE deps' top-level names the entry
  can't reference. A correct fix needs the merge to preserve each module's import
  set + scope chain (global token coordinates, or per-module-tagged vis spans with
  an import-visibility check) rather than a flat global scope. Pre-existing since
  `scopeAt` shipped; the imported-name DISPLAY was fixed separately (de-mangle of
  `add$m1` → `add`). Def/refs/hover are unaffected — they disambiguate by module
  tag (`symOccModuleAt`).

## Test infrastructure

- **Per-file isolation vs wasm traps.** `runWasm` rethrows on trap and drops the
  partial `logs`, so a corpus-wide self-host driver that traps on one file loses all
  output and can't point at the culprit. Harnesses work around it with custom
  trap-capturing instantiation / bisection. A shared "run and capture partial logs"
  helper would remove the per-harness reinvention.

---

_Add entries as you defer cleanups. Keep it honest — a documented limitation is
still debt._
