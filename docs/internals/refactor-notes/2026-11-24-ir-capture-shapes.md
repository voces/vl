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

READINGS

## Legacy tails the IR calls

None new.
