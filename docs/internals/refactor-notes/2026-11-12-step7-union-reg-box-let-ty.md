# Step 7 L6 (step C2): a let binding's box is handed the binding's union type, 2026-11-12

Step C's second cut (`2026-11-12-step7-union-reg-box-dst-by-type.md` is C1). Of the census's
1,952 `emitUnionBoxOwed` entries with no type, 1,950 came from two call sites, each building a
binding's box with `-1` for its type whenever the binding has no annotation:
- `emitLetDecl` (817 entries in 537 programs);
- the module-scope `let` init in `emit_sections.vl` (1,133 entries in 417 programs).

## Changed

`letBindingUnionTy` (`emit_start_block.vl`) gives the union type a `let` binding holds:
- its annotation's;
- a `null` hole's the checker filled (`letNullHoleFilledTy`);
- else its init's, when that is a union or a nullable.

A hole that only its spelling records (`nliNameOf`, A/B site 66) still has none. Both sites pass
it.

## The reading

A probe compiler, built in the scratchpad and never refreshed into a seed, tagged each untyped
`emitUnionBoxOwed` entry with its call site. It read every `tests/cases` file and every distilled
`cells/` cell (9,202):

| | untyped entries | programs |
| --- | --- | --- |
| master | 1,952 | 875 |
| this PR | 4 | 2 |

The 4 left are `coalesce-join-at-list-pin.vl` (`i32|i32[]`, a let whose init is no union) and the
map-read scalar join in `coalesce-nullable-default-fused.vl` (`emitMapGetOrScalarJoin`).

## Proof

- **Local full sweep**, `sweep.vl record` with fixpoint seeds on both sides, against master
  `790e0d24`:

  ```
  same                            23995
  bytes-only movers                   0
  output movers                       0
  runs -> not-runs  (blocking)        0
  new compiler traps  (blocking)      0
  ```
- **Locally:** lint-self, rep-fuzz, `cases_wasm`, the memo-generation, state-audit and scaling
  tests, emitter-state-audit, capability probes (`--live-sites`, `--floor`), splice-scan,
  seed-size, late-demands, and the dead-export and render-parse budgets.
