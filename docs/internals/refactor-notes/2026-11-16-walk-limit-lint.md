# The `walk-limit` lint rule and its ratchet (lane WIDTH), 2026-11-16

Follows [s6b21's census](2026-11-16-type-hashcons-s6b21-limit-census.md): its numeric depth, hop and
step limits are now a lint finding, held per file by `vl check --budget
scripts/walk-limit-budget-baseline.json` (targets `compiler/entry.vl`), so a new limit fails
`lint-self.sh` and each conversion lowers the baseline in its own PR.

## The rule (`compiler/lint.vl`, `walkLimitLint`)

A text-phase rule over `compiler/` code lines (strings, char literals and `//` tails skipped):
`<counter> <op> <bound>` with `<`, `<=`, `>` or `>=`, where

- the counter is a name holding `depth`, `budget`, `hop`, `guard`, `step`, `round` or `fuel` (any
  case), or the `.length` of a name holding one of those or `path`, `seen`, `rev`, `chain`, `trail`,
  `visited`; a call (`depthOf(x)`) is not a counter;
- the bound is an integer literal from 3 to 1000 or an upper-case constant; a bare counter also
  fires on a countdown's `<= 0`, `< 1` or `< 0`.

The census's two false-hit shapes are skipped: a bound over 1000 (`mode-flag`), and a `while` limit
whose counter the same function assigns its own bound (`sentinel`, the hit is the loop's exit).

## Graded against the census

- Today's tree: **611 findings in 112 files** (the baseline). The census counted 587 sites with its
  own matcher (`capinst2.py`, scratch), 559 of them neither sentinel nor mode flag; the rule's
  counter list is the census's plus `fuel`, `chain`, `trail` and `visited`.
- Of the census's 129 reached sites, the rule fires in the function of all **121** that are not
  sentinels (the one mode-flag function, `tyHasTyVarGo`, fires on its countdown, not its flag), and
  in none of the 8 reached sentinel functions.
- Controls: `tests/vl_walk_limit_test.ts` (fires on a literal, a constant, a countdown and a walk
  length; silent on a mode flag, a sentinel exit, a non-counter, a comment, a string, outside
  `compiler/`). A `depth > 9` added to `elab_stub.vl` reds the ratchet (`walk-limit: 2 (baseline 1)`,
  rc 1) and its removal clears it.
