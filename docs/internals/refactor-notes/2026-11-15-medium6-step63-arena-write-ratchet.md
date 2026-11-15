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
- **`awFields`** holds the 105 fields of `ast.vl`'s 39 `Node` variants. It leaves out `pos` and
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

GATE_PLACEHOLDER

## Lines

- **Compiler:** +118 in `lint.vl`. That is the rule's two scanners, the 105-name list (12 lines),
  the 18-name allow-list and comments, after `vl fmt`. The approved estimate was about +45.
- **Outside the compiler:** the test, the baseline and the wiring add about +220.
- **Net:** this is an instrument, so it is all growth. It pays for itself as each L1 and medium-6
  step lowers the baseline.
