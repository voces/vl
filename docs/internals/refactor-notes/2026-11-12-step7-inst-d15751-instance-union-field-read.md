# Step 7 inst: a field read off an instance-only union of field records, 2026-11-12

Lane w321, D15751 (w315's emit-reject group E, `d15314_d315`). In
`function take(a) { print(a.h.f) }` at `a: K | J`, with `K.h = {f: i32}` and
`J.h = {f: i32 | null}`, `a.h` is `{f: i32} | {f: i32 | null}` only at the instance. The
template's type is the hole. The shared-field plan for `a.h` found no union to box the two records
into, so it answered `struct` (field code 15), and `.f` floored at
`field access receiver is not a struct`. The annotated spelling ran, at code 16.

## Changed

- `monoRegisterElabJoinRows` registers the instance's union row for a `Member` whose template type
  is no union, beside #7278's `??` case. Three lines in `emit_mono.vl`, coordinated with w317.
- `sharedFieldArmStructTag`, `sharedFieldStructBoxPlan` and `sharedFieldStructBoxName`
  (`emit_obj_lit_fits.vl`) take the read's type, not its node. Their callers pass
  `nodeTyAt(readIx, fnIx)`: `sharedUnionFieldPlan`, `emitSharedFieldArm` and
  `memberUnionFieldNameRead`. Before, they read `nodeTyIxOf(readIx)`, the template's hole.

## Measured

`scripts/capability-probes/matrix/nested-field-of-union-of-field-records.matrix.vl`, both faces,
on master `063a7160` and on this branch:

| | master | this branch |
| --- | --- | --- |
| runs, of 58 graded | 47 | 54 |
| moved to runs | — | `argument`, `param_coalesce`, `param_no_coalesce`, `param_inner_bound` and `param_null_arm` (un-annotated); `type_param` (both faces) |
| `runs → not-runs` | — | 0 |

The 4 other cells are `map_value` and `map_set` in both faces. They refuse with #7273's rep
guard, which #7325 fixes, and are not this change's.

## Proof

- D15751's witness prints `4`. It also closes D15315, the same read through a `??`, filed
  2026-11-04, and the named cell `d15314_d315`.
- **Full local sweep**, fixpoint seeds, base master `063a7160`, 23,941 programs. 23,848 are the
  same, and 3 output movers each go from refusal to runs: D15315, D15751 and `d15314_d315`.
  90 are bytes-only, all distilled `d3204_r2_ga_three_*` cells: same outcome and output, a
  different module. There are 0 runs → not-runs and 0 new compiler traps.
- `tests/vl_emit_diag_position_test.ts` used D15315's refusal as the vehicle for an instance
  refusal's anchor (D15155, D15157). Its `INSTANCE_WITNESS`, and both rows' witnesses, now
  carry D1680's refusal, a standalone `?.` whose leaf field is a map, on the same body line. The
  test passes under `SELFHOST_NATIVE_ALIGN=1`, and both rows grade as filed.
- The gates are in the PR body.
