# Step 7 L6: a map value's union row is the one its type keys to, 2026-11-12

Lane w310 took the `mvValUnionRow` floor off lane w316's queue. `mvShapeOfValNameArmTyGo`
(`emit_union_atoms.vl`) asked `unionRowOfAB(53, valName, kindTy)`, the row the value's spelling
names, and asked the type only when the spelling found none. It now asks `unRowOfTyAB(53,
kindTy)` first and takes that row's name for the slot. The spelling's row, and the D5113
`unRowOfTyKey` recovery, answer only when the type keys no row or there is no type.

The base is master `cae0121e`, with a fixpoint seed on both sides. The population is the whole
sweep, 23,966 programs.

## Movers

#7261's trial of this switch moved 70 programs. This one moves 15, and every one is bytes-only:
it still runs and prints the same.

| programs | what moved |
| --- | --- |
| 11 cases | The same size and the same type set, renumbered: the slot is minted at the type's row, earlier in the order (`maps/recursive-alias-declared-first.vl` swaps a map struct and its vals list). |
| `generics/union-projection-into-hole-param.vl` | 2,734 → 2,704 bytes. |
| D1037, D15058, D3511 | Bytes only, stdout the same. |

No mover is `runs → not-runs`, an output change, or a new trap, so there is no finding.

## Proof

- **Local full sweep.** `--prove-fixpoint` seeds on both sides: 23,951 same, 15 bytes-only
  movers (12 cases, 3 inventory), 0 output movers, 0 runs → not-runs, 0 new compiler traps.
- **Render-parse.** Flat at 19 renders and 55 parses, with `--findings`.
- **Checks.** `rep-fuzz-check.sh` is exact. `cases_wasm` passes 7,462 with 0 failed. lint-self
  is clean. The export budget, with findings, has 0 dead exports.
