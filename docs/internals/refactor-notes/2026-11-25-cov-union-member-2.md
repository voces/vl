# IR coverage: `member nullable` and the `member record` reads whose recorded kind is not the field's (lane COV-UNION, 2026-11-25)

## `member nullable`

A plain field read whose receiver's rep is `RNullable` over an `RRecord`: the generic instance's
`a.v == b.v` (D16810, `eq-instance-records-stored-apart`, `eq-generic-call-operand-stored-apart`)
reads `.f` off `{ f: i32 } | null`. Legacy's `structFieldPlain` accepts the read; the builder fell
through to `member nullable`.

- Builder (`nullRecvField`, `ir_build_ref`): the receiver is held at its record rep
  (`irBLetTempTy` of the inner record) and the field read with `RGetField` at the record kid whose
  rep is the read's own. The lowering is the ordinary struct field tail, which writes the
  receiver's non-null recover (`memRecvOwesNonNull`).

## `member record` reads whose recorded kind is not the field's

D12600, D14724 and `composite-param-pins-at-elaboration-type`: `q.a` where `q`'s type is a generic
call's open result. The read node records no kind (`repOfNode(..).rdKind` is null), so every
`fieldStoresRead*` tail of `structFieldPlain` refuses, though the field stores a plain i32.

`is-value-over-bound-field-pinned-false`'s `recArm`: `t.x.a` under `t.x is A` in the instance
pinned at `{ x: A }`. The read `t.x` records the template's kind (`variant`, of `A | B`), but the
instance stores `x` as a nullable `A` and the read owes the non-null recover; no variant index
exists, so `rowStoresArmRead` refuses. This is a stale record, not two heaps disagreeing: the
stored row's target struct is the read's own.

- `structFieldAt` (`emit_plan_union`): `structFieldPlain`'s tests before its stored-read tail, for
  a read that records no kind over an i32 field, or records `variant` over a `nulstruct` field
  whose target struct is the read's own and which the read recovers non-null. The builder reads
  it only where the record kid's rep is the read's own, or its nullable; the lowering's
  `fieldIdxAt`/`fieldTail` take the same index, and the tail's recover is the ordinary one.

## Measured

Class cut (the 47 member-family programs plus the sweep), #10194's head before and this tree
after: `member nullable` 5 → 0; `member record` function rows 2 → 1 and start rows 3 → 1; start
bodies 19 → 20 of 28; programs fully claimed 6 → 10; claimed functions 207 of 233 → 216 of 236
(the sweep's pinned-instance positions add three functions).
Q58 sweep `tests/cases/generics/nullable-record-field-read-in-each-position.vl` (a compare, a
return, an argument, a binding, arithmetic; a pinned instance's narrowed field): output equal to
master's, and blockers none under this tree where master reports `member nullable`.

## Left in the family (separate mechanisms)

- `narrowed-null-field-elem-compared-with-other-nullable`: a `nulbool` field read as `nulnone`.
- `record-list-call-spread-beside-wider-part-runs`: the read carries a narrow op (`memReadNarrowOp`).
- `eq-generic-read-operands-stored-apart`: past its member read, `null name test of a non-name
  null side`.
- Legacy refusal, no row (brief): `eq({ v: q.a }, { v: 3 })` with `q` as above is refused by the
  monomorphizer (`unsupported argument type for 'a' in a call to 'eq'`).

## The parked layout family (post-I8), one more program

`tests/cases/closures/record-pushed-onto-literal-records-of-wider-set-beside-returned-list.vl`:
the IR's row rep gives field `f` the i32 of a function-set id where legacy builds a closure struct.
It joins the post-I8 plan in `2026-11-25-cov-union-member.md`.
