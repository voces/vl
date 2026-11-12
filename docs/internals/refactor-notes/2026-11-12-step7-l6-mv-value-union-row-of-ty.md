# Step 7 L6: a map value's union row is the one its type keys to, 2026-11-12

Lane w310 took the `mvValUnionRow` floor off lane w316's queue. `mvShapeOfValNameArmTyGo`
(`emit_union_atoms.vl`) asked `unionRowOfAB(53, valName, kindTy)`, the row the value's spelling
names, and asked the type only when the spelling found none. It now asks `unRowOfTyAB(53,
kindTy)` first and takes that row's name for the slot. The spelling's row, and the D5113
`unRowOfTyKey` recovery, answer only when the type keys no row or there is no type.

The base is master `bebbc99d`, with a fixpoint seed on both sides. The population is the whole
sweep, 23,972 programs.

`unionRowOfAB` has no other caller, so it is deleted.

In `maps/recursive-alias-declared-first.vl`, the program behind most of the floor's hits, all
759 reaches of site 53 are answered by the type's row. None falls back to the spelling, and none
is untyped.

## Movers

A first cut always took the type's row name, and moved 15 programs, all bytes-only. Merged with
master after #7381 it lost `maps/inferred-map-literal-record-list-union-narrowed.vl` (`runs →
not-runs`). Its spelling `{x:i32}[]|i32[]` names the type's own row, which #7381 had named
`#anon0[]|i32[]`, and renaming handed the `#anon` handle to readers that cannot resolve the
record. So the slot keeps a spelling whose row is the type's row, and takes the row's name only
when the spelling names another row or none. That cut moves nothing.

## Proof

- **Local full sweep.** `--prove-fixpoint` seeds on both sides, against master `bebbc99d`:
  23,972 same, 0 bytes-only movers, 0 output movers, 0 runs → not-runs, 0 new compiler traps.
- **Render-parse.** Flat at 19 renders and 55 parses, with `--findings`.
- **Checks.** `rep-fuzz-check.sh` is exact. `cases_wasm` passes 7,462 with 0 failed. lint-self
  is clean. The export budget, with findings, has 0 dead exports.
