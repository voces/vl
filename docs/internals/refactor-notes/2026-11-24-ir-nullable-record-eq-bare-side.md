# IR: a nullable record compared with a bare one (2026-11-24, lane S1)

`nullable record eq bare side` was a builder miss for `x == y` where `x: C | null` and `y: C`. On
master `838bb284` it had 6 rows across 5 programs: 3 functions and 3 start bodies. They came from
`operators` (3), `eval-order` (1), `lint` (1) and `closures` (1).

## The mechanism

- **Removing the miss alone does not work.** The IR handed a bare parameter side to `structEqRoots`
  as a local root, so the guard null-tested it with `local.get` and `ref.is_null`. Legacy's
  `structEqStage` passes locals `-1,-1`. A bare side therefore takes the expression root, and
  `emitEqIsNull` writes `i32.const 0` with scratch of its own. The result was a locals mismatch in
  `nulrec-eq-bare3::eq` (0x42 vs 0x43).
- **The fix.** Under `seNul`, `structEq` (`ir_lower.vl`) reads a side that is not staged, not an
  element and not `RNullable` as a place side. It skips the temp and its root is the node, as in
  legacy. A non-null record is never `ref.is_null`-tested: in `wasm-dis` of `eq`, only `$0` is
  null-tested, and the IR and legacy builds are byte-identical.
- **Effectful sides are unaffected.** A call or a field of a call is staged (`structEqStagesLeft`
  and `structEqStagesRight`), so it never takes the place route. The witness counts each call
  once, the same on both seeds.

## Measured

- Census: 4 of the 6 rows are covered and byte-matched. The other 2 move to classes that were
  already open, which the bare-side miss had masked:
  - `context-typed-nullable-variant-param::__lambda_3` goes to `union cast after an operand`.
  - `deep-record-compare::@start` goes to `non-stack temp: out of order` (D17420: a record
    literal operand holding a `null` field).
- `matrix/nullable-record-eq-bare-side.matrix.vl`: 64 graded cells run on both seeds. Under
  `VL_IR_SHADOW=6`, 60 cells go from uncovered to clean. The 4 that stay uncovered are
  `array_element_place` (`record compare element place`) and `map_value_place`
  (`record compare place operand`), both in classes that were already open.
- Witness: `tests/cases/operators/nullable-record-eq-bare-side-positions.vl`.
