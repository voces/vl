# Medium 6 step 6.3: a ratchet on writes into existing nodes (2026-11-15)

Step 6.3 of `2026-11-15-medium6-lowering-design.md`. It measures what keeps `Parsed` from being
frozen, and it keeps that count from rising.

## What changed

- **`arena-write-after-lower` (`compiler/lint.vl`)** is a text rule, like `arena-scan-outside-pass`,
  because lint has no types. It flags two kinds of write:
  - an `arenaSetNode` or `arenaReplaceNode` call;
  - a store into a node field: `x.f = …`, `x.f[…] = …`, or `x.f.push`, `pop`, `splice` or
    `unshift` for a field `f` in `awFields`.
- **What it skips:**
  - `compiler/ast.vl` and `compiler/parser.vl`, which build the arena;
  - the 18 PRE functions in `awLowering`, which are the resolve-time lowering;
  - strings, character literals and `//` tails.
- **`awFields`**, a space-separated string, holds the 105 fields of `ast.vl`'s 39 `Node` variants. It leaves out `pos` and
  `fnRet`, because another record type (`TyFunc`, among others) also declares them, so a write
  through those names cannot be told apart. `tests/vl_arena_write_fields_test.ts` re-derives the
  list from `ast.vl`, reading one-line and multi-line type bodies by brace matching, and fails on
  drift.
- **`scripts/arena-write-budget-baseline.json`** holds the per-file counts, and the count may only
  fall. `scripts/lint-self.sh` grades it over the compiler-graph report. The code is also listed in
  `lsp/src/ratchetHold.ts`, `tests/budget_targets_test.ts`, `tests/vl_lint_rule_scope_test.ts`
  (the fixture gains a node-field write) and `docs/internals/lint-rule-scope.md`.

## The count

**259 writes into existing nodes, in 32 files.**

| file | writes | retires at |
|---|---:|---|
| `emit_rewrite.vl` | 145 | L1 I8, when the pre-emit rewrite passes become builder decisions or IR passes |
| `emit_mono.vl` | 23 | L1 I9, phase B |
| `driver.vl` | 18 | the parse bank and the renames: L5 step 6 (`SymId`) |
| the checker's MID and POST rows (`check_*.vl`, `typecheck.vl`) | about 60 | medium 6 steps 6.4 and 6.5, and the POST rows at I9 (I8 at the earliest) |
| the rest (`json_walk.vl` 7, and so on) | the remainder | per file |

The design note's inventory counted 61 overwrite calls and estimated at least 19 field writes in the
checker. This rule sees the field writes everywhere, and emit_rewrite's 145 are most of them, so
the ratchet is also a progress meter for L1.

## Gate

- **Seeds:** A is a fixpoint built from `git archive d31ab4440`; D is a fixpoint built from this branch.
- **Identity:** `probe-rollback-census.ts --fingerprint` over `tests/cases`, `distilled/cells` and
  `distilled/named` gives **20,319 programs, 0 different**. The rule is a lint, so it emits nothing.
- **L2:** byte-identical. Guest fuel is 89,536,652,106 for A and 89,536,657,131 for D.
- **Gates (re-run after the scanner was shared):** a fixpoint of `fedd29c30` against this branch gives
  20,329 programs, 0 different, and L2 is identical. 29 rows differ only when the two arms run from
  different worktrees, because module and error output carries the checkout path. Re-run from one
  tree, they match. `lint-self.sh` is clean, and it reads "arena-write budget ok — 259 writes into existing
  nodes". `vl_arena_write_fields_test`, `budget_targets_test`, `vl_ratchet_hold_test` and
  `vl_lint_rule_scope_test` pass, the last with its CLI half (`SELFHOST_NATIVE_ALIGN=1`).

## Lines

- **Compiler: +89 / −5, net +84, in `lint.vl`.**
  - The rule shares its line scanner (`codeScanLine`) with `literal-byte-write`.
  - Its two name lists are space-separated packed strings, which `vl fmt` does not reflow one
    entry per line.
  - The first cut was +118.
- **Outside the compiler:** the test, the baseline and the wiring add about +220.
- **Net:** all of it is an instrument. It pays for itself as each L1 and medium-6 step lowers the
  baseline.
