# Step 7 L6: a union member is a struct by its type, not only by its spelling, 2026-11-12

D15810. `isVariantBoxUnionAtoms` (`emit_base.vl`) decides whether a union is a variant box,
which is the gate for minting its row. It counted a struct member only by spelling: a declared
struct name, or an inline `{…}` span. A member spelled by a heap row's own name (`#anon1`, as
the naming rule spells an instance-only record) read as unboxable, so no row was minted.

## Changed

- A member whose aligned arena type (`unionAtomTysAlignedOf`) is a record counts as a struct
  (`atomTyIsRecord`).
- emit_mono's `monoPinUnionNameOfTy` spells by the naming rule (`monoPinSpellShaped`), not the
  render. That was the floor D15810 pinned, shipped here at the orchestrator's request.

## Graded

- D15810's repro under the rule spelling was invalid wasm, and now prints `2`. D15713,
  `generics/union-member-order-across-pins.vl` and `generics/union-member-order-across-joins.vl`
  print what master prints.
- **Local full sweeps**, `sweep.vl record` with fixpoint seeds on both sides, against master
  `7d392da3`. With the fix alone:

  ```
  same                            23950
  bytes-only movers                   2
  output movers                       1
  runs -> not-runs  (blocking)        0
  new compiler traps  (blocking)      0
  ```

  With the fix and the floor deletion, this PR:

  ```
  same                            23946
  bytes-only movers                   6
  output movers                       1
  runs -> not-runs  (blocking)        0
  new compiler traps  (blocking)      0
  ```

  The output mover in both is D3938, from `emit_reject` to `runs`. It prints `7` then `-1`, as
  its row wants, so the row closes with the fixture
  `tests/cases/unions/record-field-union-of-generic-applications.vl`.
