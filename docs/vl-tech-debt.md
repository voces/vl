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
- **Redundant RETURN-type annotations.** `function f(): T { … }` where the body's
  inferred return is exactly `T`. Reuse the demand-inferred-return machinery
  (`noteInferredRet`); the checker already writes the inferred return back into the
  retained type, so the comparison point exists. Lower volume risk than params.
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
