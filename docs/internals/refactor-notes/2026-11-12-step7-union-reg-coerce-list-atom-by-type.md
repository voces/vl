# Step 7 L6: the list coerce's atom tests ask the union's type, 2026-11-12

The last text caller from `2026-11-12-step7-union-reg-arm-helpers-by-type.md`'s list. The base
is #7388.

## Changed

`coerceListAtomOf` decides which list arm an int-element literal widens into, from
`unionHasAtomTy` tests. It is now handed the union's type: `emitUnionCoerceValueAtom` holds
`uTy` and threads it through `emitUnionCoerceAtomBox`. The tests ask `unionHasAtomOfTy`, which
answers an unbound member-set spelling from the row the type keys to.

## The census behind it

The outermost-caller census from #7388's note: 5 set-text hits in 2 programs here.
