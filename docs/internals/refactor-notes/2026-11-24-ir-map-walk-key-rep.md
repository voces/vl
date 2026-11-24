# IR: a map keys walk binds its key at the walked map's own key rep, 2026-11-24

Lane IR-N6; V9's repro of `for in map element rep`, under the queue's ruling. An `RMap` rep node holds only
its value rep (`rmVal`), so two map types with the same value type share one node. #9869's
`mapWalkElemRep` read a keys walk's key rep from that node's type (`tyMapKeyOf(repTyOf(map))`),
which is the key type of whichever map was interned first. A `string`-keyed map built before an
`i64`-keyed map with the value `i32 | string` made the `i64` walk's variable look off-rep, and the
builder skipped the function.

## The mechanism

- `SForIn` gains `xfKeyRep`: the rep a keys walk binds, recorded by the builder from the walk's checked
  element type (the variable's rep, legacy's `forInElemTyOf`), or `-1` for a values walk and for a
  list or string walk.
- The builder refuses a recorded key rep outside {`i32`, `i64`, string, atom} as
  `for in map element rep` (`mapKeyRep`, ir.vl).
- The verifier checks a keys walk's variable equals `xfKeyRep` and that the key rep is in that set.
  There is no `i32`/string leniency for keys: the recorded rep is the checked type's own.
- A values walk keeps #9869's rule, with `mapWalkElemRep` renamed `mapWalkValRep`. It reads only `rmVal`,
  which the node does own.

Self-tests: `walk-map-key-i64` 0, `walk-map-key-width-mismatch` (an `i32` variable, an `i64`
recorded key) 2, `walk-map-key-record` (a record as the recorded key) 2. `ir_selftest.vl` imports
`TY_I64` for them, which raises its phase-state surface 11 -> 12 (`scripts/phase-state-baseline.txt`).

## Legacy tails the IR calls

None new.

## Readings (fixpoint seeds on both sides, master 6bf25409)

READINGS

## Position sweep (Q58)

`scripts/capability-probes/matrix/map-walk-element.matrix.vl` gains `key_after_second_map_type`.
That cell builds a `string`-keyed map whose value type is `i32 | string`, then walks the keys of an
`i64`-keyed map with the same value type. 86 of 86 graded cells RUN before and after: runs -> not-runs 0,
-> silent 0. Under `VL_IR_SHADOW=6`, the base covers 1,040 of 1,042 functions; the 2 it leaves are
`for in map element rep`, the new cell's walk in both faces. The candidate covers, verifies and
matches 1,042 of 1,042.

Witness: `tests/cases/maps/for-in-map-keys-beside-a-same-value-map.vl` (prints true, 12, 2). Its
`i64` keys walk is uncovered on the base and covered and matched on the candidate. Shadow row:
`tests/ir-shadow-rows/map-walk-key-beside-a-same-value-map.vl`.

Legacy lines deleted: 0. Moved to `@ir`: 0.
