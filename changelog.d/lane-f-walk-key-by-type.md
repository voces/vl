## Type system (Track A)

- **The shape walk decides from the type, not a rendered key (step 7, D6).** `shapeWalkKeyOf` and `shapeWalkName` are deleted. The walk carries two bits: it was entered under its declaration's key, and that key is the nominal spelling. Its declaration test, its generic-application guard, its empty-key return and its leaf's shape test all read the type. A new row's label is minted from the type, for the row table only. No behaviour change: all 24,215 sweep programs are byte-identical.
