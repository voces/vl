# Step 7: an intersection alias's field and nullable positions read its record's row (D14162) (2026-11-10)

Base: master `bcf337c7` (#7060). Both seeds are fixpoints (two self-compiles, byte-identical).
The population is the sweep's 23,832 programs.

## The defect, wider than filed

D14162 was filed for `type M = Node & { v: i32 }` over a recursive `Node`, in two positions: a
record field and a nullable parameter. Four aliases were run, each in twelve positions: this
row's `M`, a recursive record widened by the intersection, a flat record (`A & { v: i32 }`), and
two inline records (`{ a: i32 } & { b: i32 }`). On master, 15 of those 48 programs refuse:

| position | refuses on master for |
| --- | --- |
| record field `{ m: M }` | all four. The non-recursive ones refuse from the declaration alone, with `struct field type … has no struct-field rep` |
| nullable field `{ m: M \| null }` | the two recursive aliases |
| nullable parameter `(m: M \| null)` | all four |
| nullable result `(): M \| null` | all four |

The other eight positions run on master: binding, return, parameter, list element, map value,
closure capture, list field and nullable local.

## Mechanism

The checker types every one of these aliases as a one-member union over its record. Four
readers ask for a `TyObj` and decline the union:

* `nameFieldCodeTy` (`emit_shape_intern.vl`): its bare rung asked `nfcIsClosedRecord(ty)`. Its
  nullable rung already peeled the alias (`nfcPeelOne`), and now the bare rung does too.
* `nulBaseStructRow` (`emit_nullable_rets.vl`): it hands a one-member union inner to
  `structRowOfRecordTy`, which already folds the alias to its declaration's row, else to its
  record's.
* `retNulRefFlag`: it counts a nullable whose inner is a one-member alias of a record as a
  nullable struct.
* `sFieldTgtStructIdx` (`emit_atom_kinds.vl`): a field of a recursive alias has no row under
  its name, because the canonicaliser leaves `Node & {…}` an intersection and `collectS` interns
  nothing for it. The field is stored at its record's row, by type. The fold is local, because
  `emit_shape_rows.vl` imports this module.

The brief proposed giving the recursive alias a row of its own in `collectS`. Reading the
record's row by type serves the same positions with one row for the canonical type, and needs
no render of the record's shape.

## Measured

* Sweep against base (both one-level builds by the base seed): 23,831 same, 0 bytes-only
  movers, **0 runs → not-runs, 0 new traps**. One output mover: D14162 `emit_reject → runs`.
* All 48 position programs run and print the expected values. The new fixture
  `tests/cases/objects/intersection-alias-field-and-nullable-positions.vl` covers the four
  positions that refused.
* Fixpoint (second refresh byte-identical); seed 6,601,413 → 6,601,753 (+340), +0.2% over its
  baseline.
* Oracle (`cases_wasm_*`, with the new fixture), inventory refs/rows, `vl_scaling_shape_test.ts`
  and `vl_probe_rollback_test.ts`: 7,506 passed, 0 failed. Render-parse 41 / 82 (baseline or
  below). Comment budget at baseline.
* Filed witnesses (`--strict`, both inventories): 4,686 as filed, 0 moved. D14162 grades as filed
  against its `Want:`.
* rep-fuzz exact. Self-lint and fmt-check clean. Late demands 6 (baseline 6). plumb-shape fuel
  main +0.5%, tail −0.6% (bar +5%); peak RSS main +0.6%, tail +0.1% (bar +10%).
