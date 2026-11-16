# walk-limit coverage: `depth < 0`, camel-case counters, and a test (lane WIDTH), 2026-11-16

Follows #8767 (`walk-limit`, baseline 558). Graded against the s6b21 census's 129 reached sites.

- **`depth < 0`.** #8767 counts a depth countdown at `<= 0` and `< 1` only. Three sites test `< 0`;
  two of them are census-reached limits (`listCopyAt`, `recCopyAt` in `check_fit_rules.vl`).
- **Camel-case counters.** #8767 counts a `depth…` / `budget…` prefix only, so `ftFwdDepth > 8`,
  `elabLitSlotDepth < 4`, `lwFreshDepth > 8`, `tyToStrDepth > 64` and similar were silent. A
  `…Depth` / `…Budget` suffix now counts at a bound of 3 to 1000 or a constant. Compared with 0 or
  1 it is a nesting test (`monoRecheckDepth <= 0`), not a countdown, and stays silent.
- **Baseline.** 558 on master → 586: 26 from the two additions, and 2 that master gained after
  #8767 merged (`check_arrow_facts.vl` 0 → 1 from #8773, `check_leaf_steps.vl` 6 → 7 from #8776).
  Lane HASH's parameter-only countdown floor, landed with this change, takes it to 583.
- **Census.** Every reached non-sentinel site still present on master fires; the four in
  `check_types.vl` it does not are already converted to a `seen` walk on master.
- **Test.** `tests/vl_walk_limit_test.ts`: run on master's rule it fails on exactly the two new
  firing lines (`depth < 0`, `walkDepth > 8`); on this rule it passes.
