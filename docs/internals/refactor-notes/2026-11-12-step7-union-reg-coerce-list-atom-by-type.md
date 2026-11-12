# Step 7 L6: the list coerce's atom tests ask the union's type, 2026-11-12

The last text caller from `2026-11-12-step7-union-reg-arm-helpers-by-type.md`'s list. The base
is #7388.

## Changed

`coerceListAtomOf` decides which list arm an int-element literal widens into, from
`unionHasAtomTy` tests. It is now handed the union's type: `emitUnionCoerceValueAtom` holds
`uTy` and threads it through `emitUnionCoerceAtomBox`. The tests ask `unionHasAtomOfTy`, which
answers an unbound member-set spelling from the row the type keys to.

## The census behind it

The outermost-caller census from #7388's note: 5 set-text hits in 2 programs here.

## Proof

- **Local full sweep**, `sweep.vl record` with fixpoint seeds on both sides, against master
  `b5daa9f9` with #7388 merged in:

  ```
  same                            23969
  bytes-only movers                   0
  output movers                       0
  runs -> not-runs  (blocking)        0
  new compiler traps  (blocking)      0
  ```
- **Locally:** lint-self, rep-fuzz, `cases_wasm`, the memo-generation, state-audit and scaling
  tests, emitter-state-audit, capability probes (`--live-sites`, `--floor`), splice-scan,
  seed-size, late-demands, and the dead-export and render-parse budgets.
