# Step 7 L6: lane B's half of the `unRowOfName` readers, 2026-11-13

Lane G split the union registry's name-taking readers (#7739's note grades them all). Lane B took
two: `isUNameDeclAB`'s no-type rung, and the callers of `unionMemberTysOf` / `unionRowOf` outside
lane G's and lane A's functions.

## Decision table

A probe compiler marked each path over the sweep (24,207 programs, master bac3d89b5):

| reader | reached | decision |
| --- | --- | --- |
| `isUNameDeclAB`, name with no declared type (`unRowOfName`) | never | loud floor; the declared-type rung stays |
| `mvValUnionHasNull` → `unionHasAtomTy` → `unMemHasAtom`, a map value with no recorded type | never | loud floor; the chain is deleted |
| `elemUnionHasLitUnionMember`, `elemUnionHasArrayMember` with no member row | never reached at all | loud floor where the row has no members |
| `unionArmTagClash`'s fallback, a `unionTy` that is no `TyUnion` | 3,663 programs, every one a `TyNullable` | members from `unRowOfTyKey(unionTy)` |

At the tag-clash fallback, the row by the type key gave the same member list as the spelling's
row in 3,662 programs. In one program the key found no row while the spelling did:
`generics/generic-union-param-litunion-alias-arm.vl`. In 13, the spelling found no row. Neither
moves the outcome: the sweep below is identical.

## Change

- `unionArmTagClash(unionTy)` drops its spelling parameter. A union type flattens its variants,
  and any other type reads the row its key reaches.
- The three unreached rungs fail loudly with a sentence naming the missing record.
- Deleted: `unionHasAtomTy`, `unMemHasAtom`, `unABAtomRetry`, `unionRowOfSpellingTy` and the
  `atomRetry` id-hit/id-miss counters, which only that retry fed.

## Measured

| instrument | result |
| --- | --- |
| full sweep, 24,207 programs, base bac3d89b5 against this change on it, both fixpoint seeds | 24,207 same; 0 bytes-only movers; 0 runs → not-runs; 0 new traps |
| fast set on the same tree | all green |
