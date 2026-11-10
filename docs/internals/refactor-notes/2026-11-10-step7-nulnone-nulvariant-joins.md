# Step 7: `exprIsNulNone` and `nulVariantIdxOfExpr` answer a join by its own rep, 2026-11-10

Group 6 of `2026-11-09-step7-classifiers-remaining.md`, after #7029, #7032 and #7056. Base is master
`1f0c88fa` (#7056), whose seed is 6,601,508 bytes. Counts are post-mono calls over the
23,834-program sweep population.

## Before

Both classifiers already answered a name, field, element or call read from the read rep. That was
the storage row for `nulVariantIdxOfExpr` (#7029) and the store kind for `exprIsNulNone` (#7032).
What kept them probed was their joins.

* `exprIsNulNone` walked a value `if`'s arms for a bare `null`, a never-returning call or a
  `nulnone` rep. It also recursed into both halves of a `??`.
* `nulVariantIdxOfExpr` took a value `if`'s row from the arm carrying the nullable rep (D1560). It
  took a same-arm `p ?? q`'s row from its left side while the default stays nullable (D2373).

## Switched

A join is now asked for its own rep:

* `exprIsNulNone`: a value `if` or a `??` is `nodeRepIs(·, "nulnone")`.
* `nulVariantIdxOfExpr`: a value `if` or a `??` that is not a map read is
  `nulVariantRowOfJoin`. When the join reps as `nulvariant`, that is the variant table's row of
  its own type's non-null member (`repVariantShapeRowOf`).

The other arms are unchanged. A `m[k] ?? d` over an arm-valued map keeps its mv slot's variant,
since that is the map's storage. An assignment reads its target. An `as` reads its target type.

Each switch was graded as a one-level candidate against the base seed over the whole sweep. In
both, all 23,834 programs give byte-identical modules or the same refusal. Neither arm's
structural walk named anything the join's rep did not.

Every answer of both functions is now a typed reader's or the emitter's storage. The probes go,
and both names join `NOT_BLIND` in `scripts/classifier-census.vl`.

## Census (`classifier-census.vl`)

| tree | probed | calls |
| --- | --- | --- |
| base `1f0c88fa` | 21 | 6,378,680 |
| this PR | 19 | 5,131,328 |

`nulVariantIdxOfExpr` (752,209 calls) and `exprIsNulNone` (494,165) leave the probe set. The
others are within a few hundred calls of the base.

**Proof.** The fixpoint seed is 6,601,153 bytes (−355). Two `refresh-compiler.sh` runs are
byte-identical.

* Sweep against the base seed: 23,834 same, 0 movers.
* `rep-fuzz-check.sh`: exact.
* `lint-self.sh`: clean.
* `seed-size --check`: +0.2%.
* `late-demands --check`: 6, the baseline.
* `plumb-shape-cost --check` under `VL_ISA=x86-64-v3` with GNU `time`:
  * main: fuel +0.8%, peak RSS 319.1 MB against 318.0 MB.
  * tail: fuel −0.4%, peak RSS 319.1 MB against 317.7 MB.
* `vl_scaling_shape_test.ts`: 90 of 90.
* `cases_wasm` shards 0–3: 7,400 passed.
* The inventory rows and refs tests pass.
* `check-filed-witnesses --strict`: 4,686 as filed, 0 output mismatches.
