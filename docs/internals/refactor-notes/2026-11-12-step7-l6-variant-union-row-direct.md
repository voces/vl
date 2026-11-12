# Step 7 L6: `variantUnionNameOfTy` reads its row, not the row's name back, 2026-11-12

This is step A of the `unNames` spelling readers (`2026-11-12-step7-l2-ret-join-rows-no-anon.md`
lists all 25). `variantUnionNameOfTy` (`emit_start_block.vl`) took the name of the row its type
keys to (`registeredUnionNameOfTy`), then turned that name back into a row with `unRowOfName`
to test its variants and its map arm (`unionHasMapArm(name)`). Now `registeredUnionRowOfTy`
returns the row itself. The variant test reads it, and the map-arm test reads the row's
recorded member types (`unionRowHasMapArm`). The name is read once, for the return.

The base is master `537452a1`, with a fixpoint seed on both sides. The population is the whole
sweep, 23,973 programs.

## Probe

The probe ran in a scratch compiler that was never refreshed into a seed, using the predicates
note's accumulator, with a reach tag.

| measure | programs |
| --- | --- |
| reach | 555 |
| `unRowOfName(name)` is another row than the type's | 1 |
| the row's map arm and `unionHasMapArm(name)` disagree | 0 |

The one other row is `generics/coalesce-join-tag-in-instance.vl`: two rows are named
`string|string`, and the name finds the other one. It builds byte-identical with the row read
directly.

## Left for step B

`coalesceResultUnionName`'s list-of-lists arm test (`unionHasRefArrayArm`) goes through
`unionArmMemberTys(name)`. That first requires the name to be its own member set, which has no
row form, so it moves with step B.

## Proof

- **Local full sweep.** `--prove-fixpoint` seeds on both sides: 23,973 same, 0 bytes-only
  movers, 0 output movers, 0 runs → not-runs, 0 new compiler traps.
- **Checks.** `rep-fuzz-check.sh` is exact. `cases_wasm` passes 7,466 with 0 failed. lint-self
  is clean. The export budget, with findings, has 0 dead exports. Render-parse is flat at 16
  renders and 55 parses.
