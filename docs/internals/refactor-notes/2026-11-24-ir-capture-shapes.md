# IR: capture binding shapes 2 and 3 (2026-11-24, lane IR-D1)

Two of `capture binding`'s five shapes, both a capture read at a rep its binding's type does not
give: the queue's shape 3 (a captured atom cell plus decode) and shape 2 (a choice adapter's tag
dispatch).

## Mechanism

- Shape 3. Legacy holds a `const` bound to a join of literal consts as the atom (`letBindIsAtom`),
  and a closure capturing it reads the `i32` and decodes it where a string is owed.
  `captureAtomCellRep` recognises the read (`exprIsLitAtom`, not the `K | null` niche, which
  misses as `capture atom niche`); the capture is held at the atom rep of the set the checker
  recorded for the read (`atomRecordAt`, now exported) and decoded through `RAtomStr`
  (`capturedAtomDecoded`). The lifted parameter is typed as that set (`liftCapVarAt`), not as the
  string its binding reads as.
- Shape 2. A choice delivered to a closed function type is an adapter that calls the captured
  choice; legacy lifts it and holds the id as its parameter after its environment.
  `tagCallee` read a lifted capture at the callee's closure rep; it now reads the parameter at
  the capture's id rep, typed as its binding, as its environment arm already did.

## Verifier

Keyed self-tests:
- `captured-atom-param-decoded-at-string`: holds, 0;
- `captured-atom-param-typed-as-string`: refused, 3.

Swapping either expected rule reds the shadow suite.

## Readings

Master 4435b3e3 → head, fixpoint seeds:
- ir-i8 census `capture binding`: tests/cases 5 → 3 functions, distilled 0 → 0, witnesses
  2 → 2; no claimed function lost in any population. The three left are D16789's nested callback
  captures and the two witnesses D16789's and D17084's.
- Identity: names 9,433, cases 7,762 and claimless 14,453 identical, 0 differ; A/B 7,824 same.
- L2 self-compile fuel: +0.02% on the base's own L2; the head seed on the base tree, +0.0000002%.

The Q58 sweep (`tests/ir-shadow-rows/capture-atom-cell-positions.vl`,
`capture-tag-adapter-positions.vl`) reads the captured atom at nine string positions and
interpolation, and delivers the choice to a closed function type at a binding, an `if` arm, a
field and a return. Every claimed position matches and prints as claimless. It found two rows on
master in the choice family: [D17097](../inventory/D17097.md), the choice handed through a
generic (invalid wasm), and [D17098](../inventory/D17098.md), the direct argument refused.

## Legacy tails the IR calls

None new.
