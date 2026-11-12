# Step 7 L2: `jrFieldFitsAt`'s `FC_I32_LIST` rung is deleted, 2026-11-12

The classifier-pairs grade ([`2026-11-12-step7-classifier-pairs-graded.md`](2026-11-12-step7-classifier-pairs-graded.md))
left one ARENA+NAME pair in lane I's own file unconverted. That pair is `jrFieldFitsAt`
(emit_shape_rows.vl), whose `FC_I32_LIST` rung compared `tyIsLitUnionArray(f)` with
`nameIsLitUnionArray(elem)` on the arm field's element name. Nothing was known to reach the rung.

**Floor.** A build with an `emitFail` floor on the rung was built by master `324d8167`'s fixpoint
seed into scratch. It fired in **0 of 24,184** programs, and its sweep against the master
recording moved nothing: 24,184 same. The earlier trap control on the same rung also fired in
none, and so did two hand-written controls built to reach it. Each control was an arm with a
literal-union list field, matched through `mvValArmOfShapeTy`.

**Deleted.** A want of `FC_I32_LIST` now falls to the ladder's last line and fits. That is sound for
the one rep: an `i32` list, a `boolean` list and a literal-union atom list share the `i32`
backing (`FC_I32_LIST`'s own definition).

**Proof.**
- **Sweep**, both sides on fixpoint seeds (base `324d8167`), 24,184 programs: 24,184 same, 0
  bytes-only movers, 0 output movers, 0 `runs → not-runs`, 0 new compiler traps.
- **Census:** ARENA+NAME goes from 7 to 6, and NAME from 32 classifiers on 62 call sites to 31 on 61.
- **Gates:** `lint-self.sh` is clean, `regress.vl` lost no runs, and `check-filed-witnesses --strict`
  graded 4,852 as filed.
