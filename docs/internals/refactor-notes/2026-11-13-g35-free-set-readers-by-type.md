# D16052: three free-set readers read member types, 2026-11-13

Lane G. Three readers took the member atoms of a set that may have no row, and so read
`msFreeAtoms`. Each now reads member types instead.

| reader | was | now |
| --- | --- | --- |
| `unionBoxHasNoRow` (wasmEmit) | atom count of the type's set | `msMemberCount` |
| `emitMapGetOrUnionBox` (wasmEmit) | atom list, used only for its length | `msMemberTysOfSet` |
| `msSetHasAtom` (emit_fn_scans) | a member spelled `string` / `i32` / `i64` / `f64` / `f32` | `msSetHasPrimKind`: a primitive member whose box tag is that kind |

`msMemberTysOfSet` is `msMemberAtomsOfSet`'s twin: the same success and count. That makes the
two count swaps exact.

## Probe

A probe compiler compared `msSetHasPrimKind(s, k)` with the old spelling test at every call. It
ran over 24,020 programs: 53 programs call it, 220 calls in all, with 0 disagreements.
