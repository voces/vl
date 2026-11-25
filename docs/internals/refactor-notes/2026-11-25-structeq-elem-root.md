# structEq hook step 3: element roots re-read from the IR's bytes (lane COV-UNION, 2026-11-25)

The last two re-entries under the record-compare hook (`nulStructEqGuardTail`): `refListReadAt`
and `emitIdxIndex`.

## Mechanism

A record compare's `elem` side (`ps[i] == ps[j]`) reads its list element again at each field,
through `refListReadAt` over an `EqRootPlace`. A receiver or index that was a place (a global
list, a global index) had no local, so the place said "its expression" (`epSlot` -1, `epIdx`
-2), and legacy wrote `emitExpr` there: a re-entry into the legacy emitter from an IR claim.

The place now carries the bytes the IR reads that place again with (`irHoistRecv`, where
`irReadsAgain` holds), written aside once: `epSlot` -3 with `epBytes` for the receiver, `epIdx`
-3 with the new `epIdxBytes` for the index. `refListReadAt` appends them as `structEqRootPlace`'s
`bytes` roots already do. `eqElemRootOf` finds the side's list read under its field reads;
`readAgainBytes` is the shared writer for both kinds of place.

## Measurements

- `scripts/ir-i8-sweep.sh scripts/ir-i8-census/keep --check` on this branch (over #10076):
  causes gone `reentry refListReadAt` and `reentry emitIdxIndex`; unexplained programs 448 → 438;
  none new. `--edges --check`: 24 edges, none new (`refListReadAt -> emitExpr` stays a static
  edge, legacy's own path).
- The 10 programs the sweep named: every function and start body still matched under the armed
  shadow, including the position sweep `tests/cases/structs/record-compare-element-place-in-each-position.vl`
  (74 of 74) and `record-compare-element-place-index-matrix.vl` (32 of 32).
