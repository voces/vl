# Rep ADT stage 3c-ii: the field code is derived, 2026-11-16 (lane REP)

This is step 3c-ii of [the stage 3 design delta](2026-11-15-rep-adt-stage3-design.md). It follows
[3c-i's read-time shadow](2026-11-16-rep-adt-stage3c-read-shadow.md), and the coordinator ruled
option 1 for it.

`fieldCodeIn` now returns `fieldCodeOfRep(repOfTy(storage type))`. It keeps the stored code only
where the storage type is a function type or has no rep. That is three named classes, each a
predicate in `emit_rep.vl` with its own row.

## The kept classes

| predicate | class | row |
|---|---|---|
| `fcKeptHoleRow` | a row minted at an unpinned hole or a type variable; no rep | D16720 |
| `fcKeptFnRep` | a function field; its code is the function storage's | D16721 |
| `fcKeptHoleList` | a list of a hole joined with `null`; no rep | D16722 |

- A row with no storage type fails unconditionally. That is 3b's assertion; on both corpora it
  occurs 0 times.
- Under `$VL_REP_SHADOW`, two cases fail loudly with `emitFail`: a derived code that differs from
  the stored one (a moved code), and a kept read outside the three classes.

An earlier class list split D16720 in two. It took the 610 reads in function-set programs to be
function-typed fields. Classifying by storage type showed that every one of them is a hole or a
type variable (`_`, `F`, `G`). The predicate for "a function type with no rep" matches 0 reads,
so it is not in the change.

## Readings

Both populations, armed: `tests/cases` and `std` (8,259 modules) plus the distilled `cells/` and
`named/` (12,172 cells).

| verdict | reads | files |
|---|---|---|
| derived, agrees with the stored code | 568,776 | 9,520 |
| derived, **moved** | **0** | |
| kept, D16720 hole row | 649 | 18 |
| kept, D16721 function field, stored differs | 49 | 3 |
| kept, D16721 function field, stored agrees | 27,591 | 1,202 |
| kept, D16722 hole list | 346 | 2 |
| kept, **unnamed** | **0** | |

D16721 is not clause 1. In all 3 files the row is emitted as `(struct (field (mut i32)))`, the
set id that the rep derives. A scratch compiler that derives the code there is byte-identical on
all 3 files.

## Identity and cost

Both seeds are fixpoints. The base is master `c65ab77eb`; the fuel pair was read on `d30dbc538`.

| | |
|---|---|
| `corpuscmp.vl` (`tests/cases`, `std`) | 8,292 modules: 6,930 identical, **0 DIFFER, 0 LOST** |
| distilled cells and named, built with both seeds | 8,905 buildable: **8,905 identical** |
| seed size | 6,376,429 → 6,377,080 (+651 bytes) |
| L2 self-compile fuel | 90,974,799,348 → 91,214,748,864 (+0.26%: one `repOfTy` per read) |
| net compiler lines | +50 |
| pin-helper delta | 0 |

## What 3c-ii does not do yet

The producers still write a code for every row, because the kept classes read it. The next step
deletes the producer arms whose code no reader can now see: every row type outside a function
type, a hole and a list of a hole. Then 3d turns the sidecars into projections, as the design
says. The −700 line estimate moves to those steps, less the ladder arms the three classes keep
until their rows close.
