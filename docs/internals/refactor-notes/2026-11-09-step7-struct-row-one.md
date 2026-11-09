# Step 7: the two struct-row readers, measured

Measured 2026-11-09 on a 4-core box, on the head of #7001 (`29f80c27`, over master `deeca2a1`).
The sweep population is 23,801 programs. Every seed is a fixpoint (two `refresh-compiler.sh`
runs byte-identical).

## What disagrees

#7001 found that `repOfTy(r).rdSlot` and `repSlotOfKind("struct", r)` differ for 389 files, read
at a recorded function result. `rdSlot` is `repSlotOfTy`, the nominal reader. `repSlotOfKind`
reads `repStructRowOfTy`, the structural one. A probe compiler recorded every type where the two
differ, at every `repSlotOfKind` struct read (`$VL_CLS_CENSUS` entries, one per type and phase).
They differ in **2,169 of 23,801 files**, on 3,173 (file, type) pairs. There are two families.

| family | files | (file, type) | nominal | structural |
| --- | --- | --- | --- | --- |
| the nominal reader declines | 2,036 | 2,961 | -1 | a row |
| two rows that are layout twins | 138 | 212 | a declared row | another row |

Five files are in both.

**The nominal reader declines.** `repSlotOfTy` answers a declared row, or the unique declared
twin of a shape. It answers -1 for every other record that has a row:

| structural row | files | (file, type) |
| --- | --- | --- |
| an object-literal shape row (`{x:i32,y:i32}`) | 1,189 | 1,623 |
| an anonymous row (`#anon1`) | 681 | 948 |
| a generic instance (`Box<i32>`) | 185 | 340 |
| a declared row | 47 | 50 |

The last row is mostly `recNarrowRecordOf`: `{ r: null }` is stored as `Circle = { r: i32 |
null }`, as its literal is built (D14495). The structural row is the one the code uses there.

**Two rows that are twins.** In all 212 pairs the two rows are `repStructSlotsTwin` (one layout
class, one wasm heap type). None is a pair of distinct heap types. The three shapes are:

| shape | files | witness |
| --- | --- | --- |
| a `new` brand and its base, `I32View` and `Buf` | 91 | D14790, `std:buffer` |
| a declared alias and an earlier shape row, `Dot` and `{r:i32}` | 43 | D64 |
| a declared record and a generic instance of the same layout, `IBox` and `Box<i32>` | 5 | `genapp-instance-twins-declared.vl` |

The nominal reader is the one that erases the brand: it answers `Buf`'s row for `I32View`, while
the structural reader answers `I32View`'s own row. A brand erases at run time (D3762), and its
row is a twin of its base's, so `is` cannot tell the two rows apart. The checker can, and it
keeps the brand.

## The ruling

The structural reader is canonical in both families. In the first it is the only answer. In the
second both answers are one heap type, so the emitted module cannot tell which was read. It is
also the reader the un-annotated result columns already take (#7001). The twin rows are not
merged here, because the brand rows and the alias rows are separate rows by registration, and
folding them is a row-creation change (w241's lane).

## What this PR converges

`repOfTy` no longer answers a struct row. `rdSlot` is now only a table column's slot
(`repDescRet`), and the struct row of a type is `repSlotOfKind`'s. With it go:

* the tree's `rtSlot`, and `rtAlloc`'s slot argument. It was written from `repSlotOfTy` and read
  only by the shadow oracle and its own hash-cons merge;
* `repTreeSlotOf`, and the shadow oracle's `slot` leg. That leg compared `repSlotOfTy` with a
  tree slot that was also `repSlotOfTy`.

The function-set call result in `wasmEmit.vl` reads its struct row from `repSlotOfKind` instead
of `repSlotOfTy`, since its question is that one.

## What still reads `repSlotOfTy`

Fifteen sites. Each one is a migration of its own, because a decline (-1) changes what a guard
does. Leads, by file:

* `emit_nullable_rets.vl` (4): `retNulRefIndex`, `retStructRowIndex`, `retStructIndex` and
  `monoRetRowName`. They are the annotation-side rows, and they fall through to name scans on -1.
* `emit_sig_tokens.vl` (4), `emit_shape_rows.vl` (3), `emit_shape_intern.vl` (1),
  `emit_union_atoms.vl` (1), `emit_mv_slots.vl` (1). Most compare `repSlotOfTy(t) != si` to ask
  whether `t` is row `si`'s declared type.
* `emit_rep.vl` (1): `repSlotOfElemTy`, where a decline keys a record by its fields.

## Proof

| check | base (#7001 head) | this branch |
| --- | --- | --- |
| fixpoint seed | 6,587,443 | 6,586,342 (−1,101) |
| sweep, 23,801 programs | | 23,801 same, 0 bytes-only, 0 output movers |
| `rep-fuzz-check.sh` | | exact, 0 baselined failures |
| `late-demands.vl --check` | 6 | 6 |

`check-filed-witnesses.vl --strict` reports one row moved, D15619 (filed `emit_reject`, now runs).
It runs on the base seed too, so the move is not this branch's.

## A probe that hung

The first probe put a module-level closure in `emit_rep.vl` so that `repSlotOfTy` could call into
`emit_rep_slot.vl` without an import cycle. With that line the seed did not finish building the
compiler. Each rung below is one line added to the compiler source, built by the seed, with a
clean build taking 29 s alone and about 50 s with two builds running at once:

| line added | module | build |
| --- | --- | --- |
| `let h: (i32) => i32 = (t: i32) => -9` | `emit_rep.vl` | timed out at 120 s |
| the same line | `emit_cls_census.vl` (70 lines) | timed out at 150 s |
| `let h: (i32) => i32 = repSlotOfTyDecl` | `emit_rep.vl` | 30 s |
| `function set(f: (i32) => i32) { }` | `emit_rep.vl` | 51 s |

The lambda initializer is the ingredient, and the module that holds it does not matter. It does
not reproduce in a small program: the same line beside 1,600 `(i32) => i32` functions builds in
143 ms, as it does in a module imported by an entry. It is not reduced further and has no row.
