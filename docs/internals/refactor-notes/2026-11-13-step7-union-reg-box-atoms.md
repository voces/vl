# Step 7 L6 (lane G, cut 7a): the box-atom retags and three dead spellings read member sets, 2026-11-13

The base is master `704a8ae6`. Five `unionSetAtomsOf` callers split a union's spelling to get its
member atoms, and one `structIndexByName` read keyed a member atom by its spelling.

## The census

A probe compiler, built in the scratchpad and never refreshed into a seed, compared the spelling's
atoms against the type's member set (`msMemberAtomsOfSet(msSetOfTyAny(ty))`), or counted whether
a fallback ran at all. It ran over the sweep list (24,170 programs).

| site | reached | disagree |
| --- | --- | --- |
| `staleBoxFrom` (a ref-list slot's union) | 15 | 0 |
| `emitBoxAtomRetag` from the shared-field `??` lowering (both spellings) | 0 | — |
| `unionBoxHasNoRow`, past its row test | 0 | — |
| `emitMapGetOrUnionBox`, the spelling fallback after the member set | 0 | — |
| `collectCloSigs`, a row with no member columns | 0 | — |
| `utkAtomText`, a member with no recorded type | 0 | — |

## Changed

- `staleBoxFrom` reads the slot type's member set and hands `emitStaleBoxRetag` atom lists;
  `emitBoxAtomRetag` takes the two types, and the `??` lowering's gate compares member sets.
- `unionBoxHasNoRow` reads its type's members.
- `emitMapGetOrUnionBox` and `collectCloSigs` refuse loudly where the member set or the member
  columns are missing, which no program reaches.
- `utkAtomText` keys a member with no type as `?` plus its spelling. `emit_union_tykey` no
  longer reads `structIndexByName`, which closes the last entry in lane B's `sNameIx`
  carve-out.

## `unionSetAtomsOf` after this

`wasmEmit` has none. `emit_collect`'s `collectDeclaredUnion` (2) is the declared registrar,
the next cut. The rest are other lanes' slices or the registry's own wrappers.

## Proof

- **Seed:** fixpoint.
- **Locally:** see the PR.
- **The full sweep:** CI's `sweep` label. Expected identity.
