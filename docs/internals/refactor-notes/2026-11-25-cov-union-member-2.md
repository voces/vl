# IR coverage: `member nullable` and the unrecorded `member record` reads (lane COV-UNION, 2026-11-25)

## `member nullable`

A plain field read whose receiver's rep is `RNullable` over an `RRecord`: the generic instance's
`a.v == b.v` (D16810, `eq-instance-records-stored-apart`, `eq-generic-call-operand-stored-apart`)
reads `.f` off `{ f: i32 } | null`. Legacy's `structFieldPlain` accepts the read; the builder fell
through to `member nullable`.

- Builder (`nullRecvField`, `ir_build_ref`): the receiver is held at its record rep
  (`irBLetTempTy` of the inner record) and the field read with `RGetField` at the record kid whose
  rep is the read's own. The lowering is the ordinary struct field tail, which writes the
  receiver's non-null recover (`memRecvOwesNonNull`).

## `member record` reads that record no kind

D12600, D14724 and `composite-param-pins-at-elaboration-type`: `q.a` where `q`'s type is a generic
call's open result. The read node records no kind (`repOfNode(..).rdKind` is null), so every
`fieldStoresRead*` tail of `structFieldPlain` refuses, though the field stores a plain i32.

- `structFieldAt` (`emit_plan_union`): `structFieldPlain`'s tests before its stored-read tail, for
  a read that records no kind over an i32 field. The builder reads it only where the record kid's
  rep is the read's own; the lowering's `fieldIdxAt`/`fieldTail` take the same index.

## Measured

Class cut (the 47 member-family programs plus the sweep), #10194's head before and this tree
after: `member nullable` 5 → 0; `member record` 2 function rows unchanged and 3 start rows → 1;
claimed functions 207 → 212 of 233; start bodies 19 → 20 of 28; programs fully claimed 6 → 9.
Q58 sweep `tests/cases/generics/nullable-record-field-read-in-each-position.vl` (a compare, a
return, an argument, a binding, arithmetic): output equal to master's, and blockers none under
this tree where master reports `member nullable`.

## Left in the family (separate mechanisms)

- `is-value-over-bound-field-pinned-false`: a `nulstruct` field read as a `variant` (an arm the
  struct stores nullable); `rowStoresArmRead` refuses it.
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
