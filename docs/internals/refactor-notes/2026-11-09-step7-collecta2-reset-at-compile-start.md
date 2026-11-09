# Step 7: collectA#2 no longer wipes the row tables

Measured 2026-11-09 on a 4-core box. The base is master `fe659e02` (#6947). Both seeds are
fixpoints (two `refresh-compiler.sh` runs byte-identical). The population is the sweep's
23,756 programs.

| | base (fixpoint) | candidate (fixpoint) |
| --- | --- | --- |
| sweep | | 23,743 same; 13 bytes-only, 0 output movers, 0 runs lost, 0 new traps |
| seed bytes | 6,577,566 | 6,577,580 (+14), +2.8% of the +3% bar |

The cost gate's reading is in the PR.

## What moved

`collectAResetTables` wiped the ref-list rows, the map-value slots and their per-node sidecars.
It then re-minted the union rows at the head of the table.
It was also the only reset those tables had, so on a shared instance it was what cleared the
previous compile's rows.

The wipe is now `rlMvTablesReset`. It runs once per compile, from `emitProgramReset`. collectA#2
keeps the union re-mark (`collectAUnionRows`) and its walk. A row a pass mints before the walk
now stands, and the walk finds it instead of minting it again.

## Probes

Three scratch builds were made one level off the pre-#6947 base seed, where the sweep was also
run, with the same 13 movers. Each records a fact with `emitFail("PROBE …")`, and each was
run over the population in `vl check --batch --codegen`.

* **The tables at the walk's entry.** The first probe kept the wipe and checked that every row
  present at the walk's entry was minted again by the walk. In batch mode it fired 4,498 times,
  and on 119 programs built alone it fired 0 times. The batch hits were the previous file's rows.
  This is the probe's positive control.
* **The same check after the move.** The wipe now runs at compile start, so the batch is
  uncontaminated. 6 programs have a row from before the walk that the walk does not mint again:
  D187, D4932, D4966, `array-alias-inline-shape-element`, `array-alias-map-element` and
  `shape-list-union-return-into-field`. No map-value slot is lost. Before #6947, neither
  integer-key flag was lost either.
* **The union re-mark.** This probe tested whether `collectAUnionRows` is a no-op now that the
  registration rows stand. It is not: in 52 batch hits it mints rows that the registration-time
  call keyed differently. It stays.

## The 13 bytes-only movers

Each mover was built alone under both seeds and disassembled with `wasm-dis`. All 26 modules
validate with `wasm-opt`. Every mover has the same type count and the same function count under
both seeds. Erase heap-type indices and `i32.const` immediates, sort the lines, and all 13 are
identical. Two are identical once the heap-type indices alone are erased. Each of the other 11
changes only union tag constants (for example D187's 16 → 19). Those tags are keyed by
ref-list slot, and the slots moved. The six programs from the second probe are among the 13. Their
surviving rows add no type, since each row twins a pair the walk mints.

## What stands

* The walk is still the only minter for most rows. Making the rows mint on first read needs a
  ref-list pair minted after `mAssignTypeIndices`. Its twin would be found by signature, and its
  element heap resolved at mint time. `mAssignRefListPairs` does both today, as one block.
* The union re-mark, the join atoms (`markInferredJoinAtoms`), the frameless `__array_new__`
  arm and `collectAFieldTables` are still collectA#2's.
