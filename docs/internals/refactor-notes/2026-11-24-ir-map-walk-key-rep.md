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

Each arm is measured with `VL_IR_SHADOW=4 vl check --codegen --compiler <that arm's seed>`. The base
seed is built from `git archive 6bf25409`; both seeds are fixpoints.

- Functions with no blocker:
  - tests/cases: 84,457 -> 84,458. The one gained is the new witness's `keys` (+1).
  - distilled corpus: 46,897 -> 46,897.
- `for in map element rep`: tests/cases 1 -> 0; corpus 0.
- No program loses a function.
- Identity:
  - `--names`: identical 9,433, differ 0; the self-compile is identical.
  - `--cases`: identical 7,977, differ 0; witnesses 72 same.
  - `--claimless`: identical 14,473, differ 0.
- Mode 3: corpus and self-compile identical.
- The `tests/cases` A/B: identical 7,698, differ 0.
- Armed self-compile: 20,608 covered = verified = matched on both seeds.
- Armed tests/cases: the candidate covers 84,458 and the base 84,457. On both seeds the same 11
  functions mismatch (`prefix or locals`), so this change does not cause them.
- L2 self-compile fuel: +0.02% on base 6bf25409 (127,340,865,657 -> 127,370,574,240).
- Late demands 10 of 10; late tag rows 315 of 315.
- rep-fuzz exact; regress: no runs lost; self ir misses 0.

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
