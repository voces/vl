# D16032 / D16052: a list arm's element union is read from its row only, 2026-11-14

Lane G. Two readers of a ref-list slot's element union fell back from the row its type keys to
the row its label (`rlElemUnionName`) is bound to:

- `unionRefArrayArmSlotForElemAtom`, through `unionArmsOf`;
- `elemUnionMemberTys`, through `unionMemberTysOf`.

D's label map over 24,170 records found that neither fallback is ever reached. They are deleted:

- `elemUnionMemberTys` reads the keyed row alone. Its callers already fail loudly on false.
- `unionRefArrayArmSlotForElemAtom` fails loudly where the keyed row records no members.

That leaves three functions with no caller, and they are deleted:

- `unionArmsOf`
- `unionMemberTysOf` (registry)
- `unionArmsOfSet`, which `unionArmsOf` alone called

`unionArmsOfTy` keeps the one remaining atom reader, `nulRefMapValInnerOfTy`.
