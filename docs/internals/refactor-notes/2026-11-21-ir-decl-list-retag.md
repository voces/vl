# IR: a record list bound at its record-or-null twin (2026-11-21, lane IR-N2)

`declaration coercion`, mechanism A, annotated part. IR-N4's diagnostic listed 17 list rows, in
which the binding's rep is its annotation's and the value is built at the initializer's own type:
the `d741_eager_*` and `d741_hole_*` rows, and `ckb_hole_inst_stored`. Its 1 record row
(`d811_widen_nul_dst_narrow`) goes with IR-N4's recCopy work.

Ablation of what legacy writes for `d741_eager_CircleNull__Circle`: nothing. All three locals are
`(ref $5)`, and each binding is a `local.set` of the initializer's ref. A `C | null` element lives
in the same ref list as a `C` one, whose backing is already nullable.

## The change

- `listRetag` (`ir.vl`): two list reps whose elements are the same record, one side possibly under
  a `| null`.
- The verifier's `RRetag` rule takes such a pair, beside the niche retag.
- The declaration builder retags the built value where `listRetag` holds and no pre-path coercion
  is recorded at the initializer.

Corpus covered = matched 44588 → 44605 (+17) and tests/cases +2 on one A/B over seeds of
6716810b, no new fail rows. `ckb_hole_inst_stored` is another shape and stays a miss.

Row file `tests/ir-shadow-rows/record-list-nullable-twin.vl`; witness
`tests/cases/lists/record-list-bound-at-nullable-twin.vl`.
