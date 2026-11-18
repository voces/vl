# ftCloDelivered deleted: a late arm whose two sets run as closures, 2026-11-18

Lane STORE, after B3.2a (#9000). A deletion only, measured under the rows 1–5 stop rule (the B3
note's ordered plan, row 2).

Forcing `ftParamStored`'s late term `ftLate && cm.memProp == "push" && ftCloDelivered(x)` off
moves 2 late rows and no program's check output. Both programs print their `@log` output without
it: their sets stay closures instead of being tagged late. `ftCloDelivered` (the function, 9 lines)
and the term are deleted; `mintClo*` stays, since the late escape loops read it.

Retired late rows (baseline written from a fixpoint seed): 375 → 373.
```
tests/cases/closures/function-list-element-at-two-types-pushed-through-hole-helper.vl	tag T {inc0}
tests/cases/closures/hole-helper-pushes-listed-member-onto-other-list.vl	tag N {inc0}
```

## Grades (fixpoint seeds both sides, master `d28639f5f`)

- `VL_LATE_DEMANDS=1 vl check --codegen tests`: diagnostics identical; the 2 rows gone, 0 new.
- @run A/B, 6,726 programs: 2 wasm movers, the two programs above, both printing their `@log`.
- `check-filed-witnesses --strict`: 5,468 graded, 0 MOVED, 3,436 checked, 0 mismatched.
- L2 fuel 96.5097G against master's 96.5077G measured alike (+0.002%).
- emitter-state-audit, phase-state census, lint-self: clean.
- Net compiler lines: +3 / −15.
