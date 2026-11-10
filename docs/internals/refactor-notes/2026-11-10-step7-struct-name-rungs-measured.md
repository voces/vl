# Step 7: four struct-bank name rungs, measured against a type-only answer, 2026-11-10

This is queue item 3 of the VKind lane: the 29 name-keyed slot producers of
`2026-11-10-step7-vkind-census.md` §2. It starts with the struct bank, the biggest. Base is master
`aa36acae` (#7097). **Nothing is converted here.** This note records why the obvious conversion is
not behaviour-preserving, so that the next lane starts from the measurement.

## Method

Each probe compiler wraps one producer. It computes today's answer, and beside it a candidate that
uses the type alone. It records an `emitFail` in two cases:

- `DIFF`: the type is given and the two answers differ;
- `NOTY`: no type is given, but the name answers.

Each family gets its own compiler, so a first-error mask cannot hide one family behind another. Each
sweeps the whole population of 23,857 programs. The probes are built by the base seed into scratch
and are never refreshed into `build/`. The counts below are **programs**, not sites.

| family | producer | candidate | `DIFF` | `NOTY` |
| --- | --- | --- | --- | --- |
| A | `structIdxOfElemNameTy` (`emit_nullable_rets.vl`) | own row by type, else -1 for an arm shape, else `structRowOfRecordTy` | 4 | 0 |
| B | `structRowOfNameTy` (`emit_shape_rows.vl`) | the same | 381 | 0 |
| C | `structRowOfNameOrTy` (`emit_shape_rows.vl`) | `structRowOfRecordTy(nonNullTy(ty))` | 13 | 0 |
| D | `sFieldTgtStructIdx`'s name rung (`emit_atom_kinds.vl`) | — (reach of the rung after the type rung missed) | 344 reached | — |

`NOTY` is 0 everywhere. **Whenever the name answers, the caller holds a type**, so no caller needs a
new type threaded to it. The problem is that the type gives a different answer.

## Why the answers differ

### B: a declared arm name

The candidate needs an arm guard, and two guards were tried before the one above:

- **No arm guard** (as C): 1,125 programs differ. The name is a union variant, so the name says -1
  and the type finds a twin row. Examples are `Circle` (892) and `Dot` (151).
- **`repVariantShapeRowOf` alone** as the guard: 346 programs differ, and 341 of them go `old ≥ 0 →
  new -1`. A declared struct whose shape matches an arm (`{r:i32|null}`, 146) is refused.
- **Own row first, then the shape guard** (the table): 381 programs differ, in two directions:
  - `old -1 → new ≥ 0` (273): a declared arm name (`Circle`, `Dot`) whose type has a struct row of
    its own, for example row 0.
  - `old ≥ 0 → new -1` (103): a spelled record (`{r:i32}`, `{r:string}`) found by name, which the
    type resolves to no row.

So the name carries a **declaration fact** the arena type does not: whether this record is declared
as an arm, which then has no struct row. `structRowOfNameTy`'s variant rung reads that from the name.
A type-keyed resolver can't see it while a declared arm and the shape-equal record share a type.
Converting B needs that fact on the type side first. One way is a per-declaration identity the
checker records, which the emitter reads instead of `variantIndexOf(name)`.

### A and C: layout twins

A differs in 4 programs and C in 13. These are mostly `old ≥ 0 → new ≥ 0` with a different row:

- A: `{x:i32}` row 0 by name and row 1 by type;
- C: `{r:{[string]:i32}}` row 1 by name and row 0 by type.

These are fieldset twins. The name picks the row interned under that spelling, and the type picks
the row recording the type. Where the twins share a heap type, the difference is invisible. Where
they don't, it is not, and the cells include the layout-twin witnesses
(`maps/map-value-layout-twin-heap-merge.vl`, `soundness/map-field-arm-shares-its-layout-twins-heap.vl`).
This needs a per-cell judgment of which row is the value's storage, not a blind swap.

### D: the name rung after the type rung

The rung is reached in 344 programs. In 137 of them, the field's element name is an `#anonN` row
and its element type (`sFieldElemTyIxAt`) is -1. In the other 207, a spelled shape (`{r:i32}`,
`{f:i32}`, …) has a type that `structIndexOfTy` does not resolve, because the row was interned by
spelling without its type recorded (`sTyIx`). Both are "a rep record kept where computed" work:

- record the element row's type at `recordSFieldElemRowTy` (`emit_shape_intern.vl`) for the
  `#anon` arm;
- record `sTyIx` where an inline shape is interned from a spelling with a type in hand.

Only then can the rung go.

## Instruments

The probe edits (four families, plus the two guard variants for A and B) are the wrappers described
in the method above, built by the base seed into scratch. They are not committed, because an
instrumented compiler must never reach `build/`.
