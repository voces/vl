# D16427: a bound list's own element list waits for a hole callee's write, 2026-11-15

Lane G, stacked on D16425 (#8288). Bucket (f), a local fix.

`function t(a) { a[0].push(0.5) }` over `const l = [[]]` was refused: "the callee's body writes
f64 into the list passed here, whose element is i32". The direct spelling ran.

## Mechanism

`checkCalleeWrites` (D3775) checks a hole callee's write into a binding's list against that list's
final element; it does not pin. A binding's open lists under `| null` or a record field are
recorded at the binding (`notePendingNulList`, D6270), and at scope close each is pinned to the
element a callee wrote (`flushNulListPins`). A list's own element list was not walked, so the inner
`[]` was left at the default.

## Change (`check_side_rows`, net compiler lines +4; pin-helper delta 0)

`notePendingNulList` walks a list whose element is closed into that element, at any depth up to
its bound. A bound `[[]]` and `[[[]]]` take the callee's write, in either declaration order.

With D16425's link (#8288), the record spelling's witness also runs. Its declarations-last face is
D16426.

## Grading

`--before`: the #8288 head seed.

- The witness prints `0.5`.
- Neighbours unchanged: no write, a direct write after the call, an `i32` element, and a conflicting
  later direct write (refused as before).
- Two callers and two levels deep now run. Fixture:
  `closures/bound-nested-list-written-by-hole-callee.vl`.
- `regress.vl`: no moves. `decl-order-ab.vl`: no new mover.
- `check-filed-witnesses --strict`: 5134 graded, all as filed.
