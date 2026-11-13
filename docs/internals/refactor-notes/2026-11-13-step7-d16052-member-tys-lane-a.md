# Step 7, D16052: seven union-arm readers test member types, not atoms (2026-11-13)

This is lane A's slice of the D16052 close. Lane G owns the rest, and the deletion of
`msFreeAtoms` waits on both slices. Each site below read a union's arms through `unionTyArms`,
which hands back the member spellings (atoms) beside the member types.

| site | file | it read | it reads now |
| --- | --- | --- | --- |
| `markValueUnionAtoms` | emit_union_atoms | atom count | `unionTyMemberTys` |
| `unionHasMapArmSlot` | emit_union_atoms | atom count | `unionTyMemberTys` |
| `monoPinCanonKind` | emit_mono | atom count | `unionTyMemberTys` |
| `monoNicheNarrowsFrom` | emit_mono | atom count, and atom-subset membership | member count, and `memberTyIn` |
| three `??` joins (via `unionTyHasAtom`) | wasmEmit | an atom spelled from the kind in hand | `unionTyHasBoxKind(ty, kind)` |

`unionTyHasAtom` is deleted, and `unionTyHasBoxKind` (emit_map_twins) takes its place. Lane G
agreed to the three wasmEmit call lines. `markValueUnionArms` now takes the member types alone.

## Why the counts cannot move

The two lists have equal length and equal coverage in both of `unionTyArms`' paths:

- The row path takes both lists from one slice (`rowArmTysResolved`).
- The set path builds them in the same loop under the same filter (`msMemberAtomsOfSet` and
  `msMemberTysOfSet`).

`unionTyMemberTys` declines exactly where `unionTyArms` does. So a count, or a loop over the
atoms that only indexes the types, is the same number either way.

## Probe

The probe computed the old and new decision at each changed membership test over the sweep
population (23,940 records; one 300-program chunk timed out).

| site | calls | programs | disagreements |
| --- | --- | --- | --- |
| `??` scalar join (`q1`) | 19 | 13 | 0 |
| `??` niche join (`q2`) | 94 | 54 | 0 |
| `??` boolean join (`q3`) | 58 | 35 | 0 |
| `monoNicheNarrowsFrom` | 396 | 212 | 0 |

The probe was validated on `tests/cases/unions/map-read-coalesce-other-arm.vl`, which reaches all
three `??` sites.

`monoNicheNarrowsFrom` answered false at every reach, and so did three hand programs that
narrow a `string | boolean | null` into a generic call. The narrowed `boolean | null` or
`string | null` is a nullable, which neither reader covers, so both versions return false before
the membership test runs. Only that unreached branch tests membership by type.

## Measurement

The branch, swept against a fixpoint of its merge base: 24,240 programs the same, with 0
bytes-only movers, 0 output movers, 0 runs → not-runs and 0 new traps.
