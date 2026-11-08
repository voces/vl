# Step 7: "own record at a variant" read off where the calls deliver

Measured 2026-11-08 on the tree of #6742 merged with master `756faab3`, 4-core box. Instrument:
`scripts/col-shadow/` (#6742), 19,357 files, 13,524 compile with no imports staged.

## The class

`fnRecordedRetCols` declined every un-annotated function whose recorded result is a variant row
while its own checker result is a record (`frsOwnRecordAtVariant`), because a delivery had widened
the recorded result. There were 17 post-mono.

Grading: an experimental build kept the old decline in the reader the emitter calls, and the
shadow alone used the new rule, so "agree" means "agrees with the walk". The recorded result
agrees with the walk for 15 of the 17. The two that differ are the ones where some call consumes
the result as the function built it:

| function | the call at the own record |
|---|---|
| `soundness/record-fresh-call-into-union-destination.vl` `mk1` | `const e1 = mk1(3)`, then `e1.v / 2` prints `1` |
| `distilled/cells/b000378.vl` `mkcall` | `(mkcall()).r == 7` |

## The rule

The decline now holds only where some call of the function (`callsOfCallee`) does not hand the
result to a destination with a type of its own (`frsCallsDeliverWider`). The consumer comes from
the write-scan index (`cwIxUpKind`):

* an argument, a list element, or a return delivers;
* a binding delivers where it is annotated, or where the record rows build it at a record
  (`recBuildTyIn`);
* anything else does not, including a member read, or an un-annotated binding the rows do not
  build elsewhere.

The un-annotated binding is the case that needs the record rows. In
`generics/inferred-return-identity-literal-also-read-at-own-type.vl`, `const q1 = d1()` is built at
`J` (D8380), and the walk follows the variant. In `mk1`, `e1` is built at nothing, and the walk
keeps the record. A function with no call is still declined.

| class, post settled | before | after |
|---|---|---|
| recorded variant, own result a record | 17 | 2 |
| agree variant | 68 | 83 |
| declined in total | 66 | 51 |

## Proof

| check | result |
|---|---|
| fixpoint | two `refresh-compiler.sh` runs byte-identical |
| seed size | 6,491,633 → 6,492,090 (+457), base is #6742 merged at its fixpoint |
| `scripts/sweep.vl` diff, 23,614 cells | 23,614 same, 0 bytes-only, 0 output movers, 0 `runs → not-runs`, 0 traps |
| `tests/vl_fn_ret_shadow_test.ts` | new `col variant` row: `mk2` agrees, `mk1` declined |
