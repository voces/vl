# VL tech-debt log

A running ledger of debt accrued while pushing features (especially the kill-TS /
self-host migration). New code has outpaced refactoring; this file is where we
write down the cleanups we're deferring so they don't get lost. Each entry: what
the debt is, why it exists, and the cleanup direction. `[PAID #N]` marks resolved
items (kept for the record); everything else is open.

Organized by area. Triage freely.

---

## Self-host migration (kill-TS)

- **Two parallel compilers.** `compiler/*.ts` (host) and `compiler/*.vl`
  (self-host) implement the same front end twice. This is intentional, transient
  debt — the whole kill-TS effort is paying it down — but until `*.ts` is deleted
  every language/semantics change must land in BOTH, and the test suite carries
  parity harnesses (`selfhost_*_test.ts`) whose only reason to exist is to prove
  the two agree. Tracked by the kill-TS roadmap (formatter parity → LSP → cli →
  delete `*.ts`).
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
- **`--ts-genesis` break-glass + TS-built seed path.** `scripts/build-compiler-wasm.ts`
  and the `fetch-seed.sh --ts-genesis` path keep a TS route to mint a seed. Needed
  until the self-host seed lineage is fully independent; retire as the last kill-TS
  step.

## Known bugs carried as debt

- **native capScan shadowing bug.** A local `let` shadowing a same-named top-level
  function breaks a lambda's capture analysis (branch `claude/capscan-shadow-fix`).
  Forces awkward renames in `.vl` source — debt paid in workarounds until the fix
  lands.

## Test infrastructure

- **Per-file isolation vs wasm traps.** `runWasm` rethrows on trap and drops the
  partial `logs`, so a corpus-wide self-host driver that traps on one file loses all
  output and can't point at the culprit. Harnesses work around it with custom
  trap-capturing instantiation / bisection. A shared "run and capture partial logs"
  helper would remove the per-harness reinvention.

---

_Add entries as you defer cleanups. Keep it honest — a documented limitation is
still debt._
