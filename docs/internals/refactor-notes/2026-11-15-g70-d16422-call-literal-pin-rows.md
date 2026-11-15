# D16422: a list literal written at the call is a pin row, with the open lists in it, 2026-11-15

Lane G, stacked on D16421 (#8254).

`function t(a) { a.push({ ys: [] }); a[0].ys.push(0.5); print(a[0].ys[0]) }` called with
`t([{ ys: [] }])` built an invalid module. Its matrix cell is `index_writes`, the last one of
`hole-param-record-empty-list-field.matrix.vl`.

## Mechanism

At the call, `pinBmCstrElems` replays the body's deferred pushes, and a value pins only a list
written at the call, which was a bare `[]` alone. The argument `[{ ys: [] }]` has a record
element, so it was not a pin row and the body's pushed record met nothing. The caller's inner
`ys` list was not a pin row either, so `a[0].ys.push(0.5)` pinned neither, and the body's
`{ ys: [] }` kept an element of its own.

## Change (`check_demands`, `check_hole_rows`, net compiler lines +37; pin-helper delta 0)

- A list literal argument is a pin row, and the open lists in it, through record fields and
  nested lists, join them (`pinRowsAddOpenLists`, from D16421).
- When a deferred push delivers a record into such a list's record element, the record's open
  list fields are linked to the element's (`tyLinkRecLists`, factored out of D16365's
  `holeElemRecLink`). This applies below the callee's declaration only, as D16421's growth does.
- `tyLinkOrPinElem`: an open field beside a concrete one takes its element, as a `[]` pushed
  onto `[{ ys: [1.5] }]` does in the direct spelling. D16365's body-to-body link gains the same
  rule, so `a.push({ ys: [1.5] }); a.push({ ys: [] })` types the second `ys` at `f64`. A
  conflicting later write is then refused, as it is in the direct spelling.

## Grading

`--before`: the #8254 head seed.

- The witness and the `index_writes` cell print `0.5`. Two calls, `t([{ ys: [1.5] }])`, and a
  read through the pushed record all run. Fixture:
  `tests/cases/closures/hole-param-record-pushed-beside-the-call-record.vl`.
- Filed: D16425, a bound list `const l = [{ ys: [] }]; t(l)`, an invalid module on both seeds.
