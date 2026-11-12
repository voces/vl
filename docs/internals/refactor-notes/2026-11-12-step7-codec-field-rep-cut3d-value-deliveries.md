# Step 7 codecs, cut 3d: the struct and variant field value deliveries match on the storage kind, 2026-11-12

This continues cut 3b of `2026-11-11-step7-codec-field-rep-column-design.md` (#7250) in
`wasmEmit.vl`. It moves the value deliveries that dispatched on the field code.

## What changed

- **`emitStructFieldValueUnder`** reads `fieldRowKind` of the field's flat row (cut 2,
  `emit_eq_rows.vl`), which falls back to the code where the type is unrecorded, uncovered or
  `nulnone`.
  - Its guards ask the kind: a struct value only into a record ref or the box, a lambda only into a
    closure slot or the box, and the ref-list slot bound.
  - Its emission ladder is an exhaustive `match` over `VKind`.
- **`emitVariantFieldValueUnder`** does the same through `eqRowFieldKind(-1 - vi, fj)`.
- **`emitOmittedFieldNull`** takes no code. It matches on the kind.
  - The heap-only nulls (`string`, the lists, closures) write through `fbRefNullForKind`.
  - Only the `i32` arm needs the null discipline: a `K | null` field (code 30) is the `-1` niche,
    and a plain `i32` has no null (`fieldRowIsPlainI32`).
- `fieldKindTakesClosure(k)` names the three kinds a lambda can be stored at.
- A null kind means no field. It now fails loudly ("struct field has no storage kind") instead of
  falling through to `emitExpr`.

Codes 0 and 30 reached `emitExpr` by different arms that did the same thing, so a single
`i32` arm loses nothing.

## Measurement

`sweep.vl diff`, master `5e0a0ccf`'s fixpoint seed (6,646,945 bytes) against this one (fixpoint,
6,647,187 bytes), over 23,962 programs:

- **23,962 same**;
- 0 bytes-only movers;
- 0 output movers;
- 0 `runs → not-runs`;
- 0 new compiler traps.

## What is left in `wasmEmit.vl`

- `emitVariantFieldStoreVal` and `emitAssignMember`;
- `emitOptChainIsNull`, `emitOptMemberValueGo` and the three `emitCoalesceOpt*` arms;
- `coalFieldStoredFlat`;
- the order stash (`objOrderStashSlot`), which keys on the code through `liBack`.

The two kind getters, `fieldRowKind` (`emit_eq_rows.vl`) and `fieldRowStorageKind`
(`emit_atom_kinds.vl`), differ in two ways. The first floors a hole's record to the code's kind
and keeps `nulvariant`. The second answers null for a hole's record and names a variant ref as its
arm's struct row. They fold into one when cut 5 types the floors.
