# Step 7: the literal-atom classifiers answer an `if` by its own rep; `exprNulLitUnion` switched, 2026-11-10

Group 6 of `2026-11-09-step7-classifiers-remaining.md`, after #7062, which answered `exprIsNulNone`'s
and `nulVariantIdxOfExpr`'s joins by their own rep. Base is master `775f38bf` (#7064), whose
fixpoint seed is 6,602,130 bytes. `seed-latest` was built before #7064, so the base sweep is of a
compiler built from master's source. Against `seed-latest`, 272 programs move bytes whatever the
candidate. Counts are post-mono calls over the 23,836-program sweep population.

## Each arm, graded alone

Each arm was a one-level candidate, swept whole against the base:

| arm | twin | result |
| --- | --- | --- |
| A: `exprIsLitAtom`'s value `if` | `nodeRepIsAtom` of the join | 23,836 byte-identical |
| B: `exprIsLitAtom`'s `??`, and its `coalesceLitUnionFits` rung | `nodeRepIsAtom` of the join | 1 `runs → not-runs` (`literal-unions/hole-map-read-coalesce-chain-nullable-atom.vl`) |
| B': B, keeping the fused map read's arm | the same | 6 `runs → not-runs`, 3 new traps (`maps/coalesce-stored-null.vl`, `maps/nullable-atom-valued-map.vl`, D3424) |
| C: `exprNulLitUnion`'s arm-carried niche `if` (`nulIfArmNullableValueIx`) | its own `if` arm, `nodeRepIsNulAtom` of the join | 23,836 byte-identical |
| D: `exprNulLitUnion`'s `??` | `nodeRepIsNulAtom` of the join | 23,836 byte-identical |
| E: `exprNulLitUnion`'s parameter read, a by-name scan of the frame's parameters | `paramTypeNodeOfRead`'s annotation rep | 23,836 byte-identical with A, C and D |

**B does not hold.** `p ?? d` over the `K | null` niche is lowered as the atom whenever the default
fits (`coalesceLitUnionFits`), and a hole map's chained `??` likewise. The join's own type may name
`string` or the niche there. The missing fact is the emitter's coalesce lowering, which no type
records. `exprIsLitAtom` keeps its `??` arms and stays probed. Its name reads already ask the
binding's cell (`bindingIsLitAtom`, in `NOT_BLIND`). Recording that on the read's store would move
no call out of the probe.

## Switched

A, C, D and E. `exprNulLitUnion` now answers:

* a cast, a value `if` and a `??` by the node's own rep;
* a parameter read by its annotation's rep;
* a capture, a `let` or a loop variable by its binding's cell;
* a field, `?.` leaf, element or call read by the emitter's storage (field code, element and
  map-value types, the callee's result).

It leaves the probe set and joins `NOT_BLIND`. Four imports that are now unused are dropped, and so are `ifIsChainHeadIn` and `ifJoinIsNulString` (emit_if_arm_values.vl), which nothing else asked.

## Census (`classifier-census.vl`)

| tree | probed | calls |
| --- | --- | --- |
| base `775f38bf` | 19 | 5,128,735 |
| this PR | 18 | 3,904,893 |

`exprNulLitUnion` (1,221,403 calls) leaves the probe set. `exprIsLitAtom` goes from 1,244,730 to
1,243,424.

**Proof.** The fixpoint seed is 6,601,085 bytes (−1,045). Two `refresh-compiler.sh` runs are
byte-identical.

* Sweep against the base's fixpoint: 23,836 same, 0 movers.
* `rep-fuzz-check.sh`: exact.
* `lint-self.sh`: clean.
* `seed-size --check`: +0.2%.
* `late-demands --check`: 6, the baseline.
* `plumb-shape-cost --check` under `VL_ISA=x86-64-v3` with GNU `time`:
  * main: fuel −0.4%, peak RSS 319.2 MB against 318.0 MB.
  * tail: fuel −1.5%, peak RSS 317.3 MB against 317.7 MB.
* `vl_scaling_shape_test.ts`: 90 of 90.
* `cases_wasm` shards 0–3: 7,402 passed.
* The inventory rows and refs tests pass.
* `check-filed-witnesses --strict`: 4,686 as filed, 0 output mismatches.
