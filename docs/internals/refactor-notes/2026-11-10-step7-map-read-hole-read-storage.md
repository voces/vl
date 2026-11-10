# Step 7: `mapReadMvSlot` and `unionNameOfHoleRead` read storage, 2026-11-10

Groups 2 and 6 of `2026-11-09-step7-classifiers-remaining.md`, under the ruling in DECISIONS.md
§"How step 7's classifier half finishes". Base is master `34f46a82` (#7076), whose fixpoint seed
is 6,598,974 bytes. Counts are calls over the 23,842-program sweep population
(`classifier-census.vl --keep`), all post-monomorphize.

## The shadow

A scratch compiler built by the base seed wrapped both classifiers and counted each answer by the
arm that gave it.

**`mapReadMvSlot`** (709,846 calls):

| arm | answer | calls | files |
| --- | --- | --- | --- |
| `m[k]` over a map receiver | the receiver's slot | 53,084 | 2,527 |
| `m[k]` over a map receiver | -1 (the mono map) | 51,504 | 831 |
| `m.get(k)` | -1 | 12,834 | 4,659 |
| an index read over no map, the union-arm fallback | -1 | 560,301 | 6,717 |
| any other node | -1 | 32,123 | 5,648 |

The union-arm fallback is entered 560,301 times and answers a slot in none of them. Its comment
said that it served the frame pre-pass, where an `is` narrow to a union's map arm is not active.
Nothing asks it from there now. A control program, a union binding narrowed to its map arm and
read with `t["a"] ?? d`, is answered by the receiver arm (`exprMap` sees the narrow). It prints
the same and builds byte-identical wasm on both seeds. Every slot the classifier answers is
`mapShapeOfExpr` of the receiver: the slot its map was built with.

**`unionNameOfHoleRead`** (161,870 calls), each answer against the kind of the read's cell, where
the cell is a slot of the emitting frame:

| answer | cell | calls | files |
| --- | --- | --- | --- |
| names a box | `union` | 231 | 94 |
| names a box | `i32` | 2 | 1 |
| names a box | not in the emitting frame | 352 | 128 |
| "" | `reflist`, `list`, `map`, `closure`, `struct`, `i32`, ... | 34,009 | 307 |
| "" | not in the emitting frame | 127,276 | 641 |

No call answers "" at a `union` cell. The two that name a box at an `i32` cell are
`generics/coalesce-join-tag-in-instance.vl`. There `c` is a `K | null` atom niche, typed
through a hole, and the walk named a union for it. No consumer used that name: the program's
bytes do not change when it answers "".

## Switched

* `mapReadMvSlot` answers only from the receiver's mv slot. The union-arm fallback is deleted,
  and `unionMapArmNameTy` loses its last importer and its `export`.
* `unionNameOfHoleRead` answers "" for a read whose cell in the emitting frame is not a union cell.
  For a union cell, the walk names the union the binding was boxed at: its annotation's. For an
  un-annotated `let`, it names the box its initializer delivered. `emitLetDeclStmt` passes an
  initializer that is already a union into the cell unchanged.

Both move to `STORAGE_READERS` in `scripts/classifier-census.vl`, with those reasons.

## Census (`classifier-census.vl`)

| tree | probed | calls |
| --- | --- | --- |
| base `34f46a82` | 10 | 2,288,406 |
| this PR | 8 | 1,416,690 |

`mapReadMvSlot` (709,846) and `unionNameOfHoleRead` (161,870) leave the probe set. The other
eight are unchanged.

**Proof.** The fixpoint seed is 6,598,638 bytes (−336). Two `refresh-compiler.sh` runs are
byte-identical.

* Sweep against the base's fixpoint: 23,842 same, 0 movers.
* `rep-fuzz-check.sh`: exact.
* `lint-self.sh`: clean.
* `seed-size --check`: +0.1%.
* `late-demands --check`: 6, the baseline.
* The dead-export budget: 0, the baseline.
* `cases_wasm` shards 0–3: 7,405 passed.
* The inventory rows and refs tests, `vl_scaling_shape_test.ts`, `vl_cls_census_test.ts` and
  `vl_probe_rollback_test.ts`: 106 passed.
* `check-filed-witnesses --strict`: 4,689 as filed, 0 output mismatches.
