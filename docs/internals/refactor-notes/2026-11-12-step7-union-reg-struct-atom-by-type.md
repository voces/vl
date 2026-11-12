# Step 7 L6: a union member is a struct by its type, not only by its spelling, 2026-11-12

D15810. `isVariantBoxUnionAtoms` (`emit_base.vl`) decides whether a union is a variant box,
which is the gate for minting its row. It counted a struct member only by spelling: a declared
struct name, or an inline `{…}` span. A member spelled by a heap row's own name (`#anon1`, as
the naming rule spells an instance-only record) read as unboxable, so no row was minted.

## Changed

A member whose aligned arena type (`unionAtomTysAlignedOf`) is a record counts as a struct
(`atomTyIsRecord`).

## Graded

- **Under the naming rule** (emit_mono's `monoPinUnionNameOfTy` by `monoPinSpellShaped`, the
  floor w317 deletes next): D15810's repro was invalid wasm and now prints `2`. D15713,
  `generics/union-member-order-across-pins.vl` and `generics/union-member-order-across-joins.vl`
  print what master prints.
- **On master's spellings**, the full sweep is in the PR.
