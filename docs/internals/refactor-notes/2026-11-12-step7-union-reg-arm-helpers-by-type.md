# Step 7 L6: three union arm helpers ask the union's type when its spelling is unbound, 2026-11-12

Text callers of `unionMemberTysOf` that still reach the softened key through `unRowOfSetText`
(`2026-11-12-step7-union-reg-ref-array-arm-by-type.md`'s list).

## Changed

- `unionArmTysOfTy` reads the arms of the row the union's type keys to, when the spelling is bound
  to no row. It reads the atoms and member types from the row's own recorded columns, so the two
  pair by construction.
  - `unionClosureArmName` takes the type (its one caller, the list coerce, holds `uTy`).
  - `unionArmTyOfAtomTy` is the typed form `emitUnionUnionEq` asks with its left operand's type.
- `unionHasAtomOfTy` answers from the type's row, with `unMemHasAtomRow`. `emitUnionListLitViaRefArm`
  and `emitEmptyArrUnionArm` ask it with the union type they hold.

## The census behind it

A probe compiler, built in the scratchpad and never refreshed into a seed, tagged each set-text
hit with its outermost caller. It read every `tests/cases` file and every distilled `cells/`
cell (9,202). These sites held 23 hits:

| site | hits |
| --- | --- |
| `emitUnionUnionEq` | 12 |
| `emitUnionListLitViaRefArm` | 6 |
| `emitUnionCoerceList` | 4 |
| `emitEmptyArrUnionArm` | 1 |

## Not changed

`coerceListAtomOf` (5 hits) is handed a member-set id, not a type, by its caller. It needs one
threaded from that caller's caller. The tag that `unionArmTagOf` gives an arm stays keyed by the
arm's exact type (#7347); only the arm's type is read here.

## Proof

- **Local full sweep**, `sweep.vl record` with fixpoint seeds on both sides, against master
  `8580f63d`:

  ```
  same                            23965
  bytes-only movers                   0
  output movers                       0
  runs -> not-runs  (blocking)        0
  new compiler traps  (blocking)      0
  ```
- **Locally:** lint-self, rep-fuzz, `cases_wasm`, the memo-generation, state-audit and scaling
  tests, emitter-state-audit, capability probes (`--live-sites`, `--floor`), splice-scan,
  seed-size, late-demands, and the dead-export and render-parse budgets.
