# IR: a record list returned into a result whose type holds a hole (2026-11-22, lane IR-N2)

`return coercion`, list to list. On a fixpoint seed of master dfc71b02, 28 corpus functions
missed with a list value whose rep is not the result's. In 26 of them the elements are records
holding a generic function (`[{ f: inc0 }]` with `function inc0(a) { return a + 1 }`). Those are
the `d15209_*_dbl`, `d15221_*_dbl` and `d15203_*` named cells. The value is built at its instance,
`list<rec{clo(i32)->i32}>`. The result is typed from the function's type, which still holds the
type variable, so its rep is `list<rec{clo(unsup)->unsup}>`.

Ablation on a scratch seed that retagged every list-to-list return: those 28 functions were
covered, and all 28 matched. Legacy writes nothing at these returns, because
`emitReturnPlainValue` is the value's own `emitExpr`. `retStorageMismatch` (inside
`retRefusedWhy`) has already said the value is built at the result's storage.

## The change

- `listRetagHole` (`ir.vl`): two list reps that agree everywhere except where `dst` leaves a
  closure's parameter or result unknown (`unsup`). The verifier's `RRetag` rule accepts such a pair
  beside `listRetag`.
- The return builder retags a built list into the result where `listRetag` or `listRetagHole`
  holds and `exprPrePathWhy` records no coercion at the value. This is the same answer the
  declaration retag reads.

The reverse direction stays a miss, with the hole in the value and a concrete result
(`hole-fn-set-member-bound-at-delivered-nested-list`).

Row file `tests/ir-shadow-rows/list-return-into-hole.vl`; witness
`tests/cases/lists/record-list-of-functions-returned-into-generic-result.vl`.
