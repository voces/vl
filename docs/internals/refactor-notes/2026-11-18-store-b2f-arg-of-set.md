# B2f: a complete call row records the set its parameter takes, 2026-11-18

Lane STORE, after B2e (#8985). B2e's live-arm table names site 15 (`ftLateArgOfSet`) as the
late arm with the most programs behind it (64 programs, 44 rows). Most of those are refutations of
check-decided sets: the arm builds dispatch arms per instance, which is B3's work. Two of its rows
were sets the check left undecided only because `arrowRowFacts` dropped a complete row that had no
facts to note: the parameter's set (`afTakes`) was never recorded, so `ftLateParamTakes` found it
only from the mint facts at late.

## Change

`arrowRowFacts` (`check_arrow_facts.vl`) records `afTakes[d|i]` for every row whose facts stand,
and sets `afSeen` only when the row carried facts. +6 / −1 compiler lines.

## Retired late tag rows (baseline written from a fixpoint seed)

```
tests/cases/closures/hole-fn-if-element-list-handed-hole-fn.vl	tag N {add}
tests/cases/functions/hole-fn-list-element-handed-generic-beside-uncalled.vl	tag T {add}
```

392 late tag rows remain; no row is new.

## Late code made dead

None. `ftLateArgOfSet` and `ftLateParamTakes` still decide other sets; both go in B3, where the
elaboration takes storage per (KeyId, parameter) instead of re-running the plan.

## Grades

- `VL_LATE_DEMANDS=1 vl check --codegen tests`: output identical to master's except the two rows.
- @run A/B over 6724 programs, `master-fix.wasm` (c1eb151c9 fixpoint) against this fixpoint: 0 movers.
- `check-filed-witnesses --strict` on both inventories: 5467 graded, 0 MOVED, 0 output mismatch.
- L2 fuel 97013239929, +0.8% on baseline (gate +1%). Seed fixpoint (refresh twice, `cmp`).
- Phase-state census ok; lint clean; `emit_mono.vl` untouched (908).
