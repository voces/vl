# D16425: a record pushed beside a bound list's own shares its open list fields, 2026-11-15

Lane G, stacked on D16422 (#8278). This is the coordinator's option (a): ship the link, file
D16427, and mark D16426 (c).

## Mechanism

`function t(a) { a.push({ ys: [] }); ... }` over `const l = [{ ys: [] }]`: a binding's list is
not a pin row at the call ("a binding's list keeps its own later writes"), so `cnhPinBmElem`
returned at once. The body's pushed record met nothing, and its `ys` kept an element of its own:
an invalid module.

## Change (`check_demands`, net compiler lines +5; pin-helper delta 0)

In the not-a-pin-row arm, a record the deferred push delivers into a bound list's record element
has its open list fields linked to the element's (`tyLinkRecLists(got, elem)`, with the binding's
hole kept as the root). This applies below the declaration only, and the binding is not pinned.

- Runs now: the body pushes a record and the caller writes `l[0].ys` or `l[1].ys` afterwards.
  Fixture: `closures/hole-param-record-pushed-onto-bound-list-then-written.vl`.
- The witness (the body writes `a[0].ys.push(0.5)`) is now a loud check reject from
  `checkCalleeWrites`. That check tests a callee's write against the binding's final element and
  never pins it. The same refusal fires on master without records, filed as D16427 (bucket (f)).

## D16426

Above the declaration, `eagerCheckable` exempts the un-annotated callee, so its body is checked
after the call and `pinBmCstrElems` has nothing to replay. Lifting D16422's guard changes nothing.
D16426 is marked a bucket (c) clause-1 acceptance row, as D16430 and D16431 were.
