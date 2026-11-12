# Step 7, L6: two of lane G's union readers by type, 2026-11-12

The coordinator handed lane B two slices of lane G's union-registry split. Measured on master
`b323f223`, 24,202 programs, with an accumulating probe.

## `memReadBoxedAtomKinds`

A field or element read of a union box dispatches over every value atom the box can hold. The
atoms came from the box union's NAME (`unionSetAtomsOf`), each atom's kind from its spelling
(`valueAtomKind`). The member read that named the union already records the row its type keys to
(`memFieldRowOut`, set by `memVariantFieldName` and `memStructFieldName`). That row's member
types (`unionMemberTysOfRow`) and their box tags (`boxTagOfTy`) give the same set.

| mark | programs |
| --- | --- |
| reached | 27 |
| the typed kind set differs, or one side declines | 0 |
| reached with no recorded row (a narrowed read) | 0 |

`memReadBoxedAtomKinds` now reads the row's member types. `memberUnionFieldRowRead()` exports
`memFieldRowOut` for it. A read with no recorded row returns false, keeping the single cast. The
probe saw none.

## `unRowOfRecordTy`

It answered a record type's union row by type key, else by the spelling of the type with
literals widened (`unRowOfName(unionSpellingOfTy(ty))`). The spelling rung answered in **0**
programs, so it is deleted. The function is the type key alone.

## Proof

- Refresh ×2 is a fixpoint at 6,716,314 bytes, against master's 6,716,369.
- Sweep against master's fixpoint seed: **24,202 same**, 0 bytes-only movers, 0 output movers.
- lint-self is clean, and `regress.vl` lost no runs.
- Witnesses `--strict`: 4,863 as filed, 0 moved.
- Late demands 8, and dead exports and render-parse within budget.
