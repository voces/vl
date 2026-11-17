# A list of vectors (`F32x4[]`), and a map of them

Status: the flat list landed 2026-11-15 (`v128list`), after the element-kind refactor; the bare
map value (`MVK_V128`, D16891), a list of vector lists (`RLK_V128_LIST`) and the nullable twin
(`nulv128list`, which also carries a vector-list map value) 2026-11-17. A vector list as a
value-union member has no atom yet (D16943). Measured outcome in
`refactor-notes/2026-11-15-lane-l-v128list.md`. It closes D1981's array and map faces, the last
of its four (the struct field closed with `FC_V128`, the nullable and union members with D2633).

## What the tree does

- **`F32x4[]` is refused at check** (`tyNestsV128`, the `TyArray` arm). Lifting that in a
  throwaway probe seed shows the emitter has no list kind with a `v128` element: every list
  operation falls through to its "not a list" refusal:
  - `.length` on a receiver it "cannot classify";
  - an index is "not an array";
  - `.push` "receiver is not a list";
  - an indexed write "target is not an array";
  - `for … in` "walks no list";
  - `.map` "callee is not a function name";
  - a record field gets "no struct-field rep".
- **Two spellings work today**:
  - a list of one-field records `{ v: F32x4 }[]` (since `FC_V128`);
  - `(F32x4 | null)[]`, a reference list of union boxes.

  Reading `??` straight off the second is an emit reject ([D16483](inventory/D16483.md)), and
  a literal `[splatF32(1.0)]` delivered into it is refused before it widens (D1981's own array
  face).
- **`Buf` lanes** (`loadF32x4` / `storeF32x4`) are the unchecked flat workaround.

### Baseline

100,000 vectors, 100 passes of `xs[j] = xs[j] + splatF32(1.0)`. Built `-O3`, median user
CPU of 10 runs, and peak RSS from `getrusage`:

| spelling | user CPU, median (min–max) | peak RSS | allocations in the update loop |
| --- | --- | --- | --- |
| `Buf` lanes | 0.033 s (0.018–0.037) | 13 MB | 0 |
| `{ v: F32x4 }[]` (a field write) | 0.044 s (0.039–0.067) | 13 MB | 0 |
| `(F32x4 \| null)[]` | 0.206 s (0.180–0.256) | 265 MB | 2 |

The record-list spelling is already within about 30% of flat memory, because a field write
mutates the box in place. A flat list would buy that last 25% and, mainly, a spelling that
reads as what it is: `F32x4[]`, `xs.push(v)`, `xs[i] = v`.

## Proposal: a flat `v128list` kind

`F32x4[]` becomes the scalar-list shape every other scalar element uses: a wrapper
`(struct (mut (ref (array (mut v128)))) (mut i32))`, the same layout as `f32list`, with
`0x7b` as the element type. `F32x4[]`, `Mask32x4[]` and `v128[]` share it.

What a new kind touches, counted on the tree against `f32list` as the model:

| site | count | what it needs |
| --- | --- | --- |
| exhaustive `VKind` matches with `"f32list"` in a grouped arm | 44 | `"v128list"` added to the same group |
| own `"f32list" =>` arms | 31 (13 in emit_bytes, 4 in wasmEmit, 3 in emit_list_rep) | grouped with `f32list` where only the valtype differs, else an arm |
| field-code ladders naming `FC_F32_LIST` | 9 | an `FC_V128_LIST` code beside it, derived from the rep as `FC_V128` is |
| list-kind and eq codes (`LBK_*`, `eqListKindOfListRep`) | 2 | one code; eq refuses by design |
| interned array and wrapper types (`fa32Ty`, `fl32Ty`) | 2 | one pair |
| map value kind (`MVK_F32`, 12 mentions in 5 files) | 12 | `MVK_V128`, for the map face |
| the checker's `TyArray` / `TyMap` arms in `tyNestsV128` | 2 | `tyNestsV128` instead of `tyIsOrNestsV128`, as the struct field did |

**Estimate:** +120 to +200 compiler lines and no new functions. Most grouped arms are a
token on an existing line, so the bulk is the 31 own arms and the type section. The nullable
twin (`nulv128list`, for `F32x4[] | null`) would add as many arms again. It is left out, so
that annotation must keep a refusal. Narrowing the `TyArray` arm alone would let it through,
so the `TyNullable` arm keeps answering true for a vector list beneath it.

**Projected effect:** CPU at or near the `Buf` row, 13 MB, and no allocation in the update
loop. The module size of a list program should match its `f32[]` twin within the
element-type bytes.

**Refused by design** (each already a vector contract, inherited rather than new): `==`
between lists, `includes`, `indexOf`, `sort` (no order on four lanes), `join`, and `print`.
A probe confirms each one names the vector contract before the gate narrows.

### Order and matrix

The order is the one CLAUDE.md sets for a capability gap: build the lowering, wire every
delivery position, and only then narrow the gate.

1. **The kind and its types.** Literal, `push`, index read and write, compound write,
   `.length`, `for … in`, `pop`, and slice.
2. **The generic std methods at `T = F32x4`.** `map`, `filter`, `reduce`, `forEach`, `some`,
   `every`, `find`, and a user generic `T[]`.
3. **The list in other places.** In a struct field (`FC_V128_LIST`), in a list (`F32x4[][]`, a
   reference list of `v128list`), as a closure capture and a lambda result, and as a map value
   (`MVK_V128`).
4. **Narrow the gate.** `tyNestsV128`'s array and map arms.

The matrix is a `v128-list.matrix.vl` template whose value is an `F32x4[]`, delivered at every
built-in position, with own cells for each list operation above. A second template,
`v128-list-generic.matrix.vl`, delivers the list into a generic `T[]` parameter, since a
capability with a type parameter needs a template that leaves it open (CLAUDE.md §fixture).
The bar is both templates `--before`/`--after`: 0 runs→not-runs, 0 silent, and every cell
runs except those the design refuses above, graded OWED.

## Not proposed

- **Lowering `F32x4[]` as a list of one-field boxes.** This is the `{ v: F32x4 }[]`
  representation, chosen by the compiler instead of the user. It saves the type-section pair
  but not the sites: every element read and write would still need a box or unbox arm. It
  also allocates on `push` and on a whole-element write.
- **A niche for `(F32x4 | null)[]`.** It keeps its union boxes; the flat list makes it an
  explicit choice.
