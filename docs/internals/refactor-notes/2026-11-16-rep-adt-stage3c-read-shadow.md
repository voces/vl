# Rep ADT stage 3c-i: the read-time field-code shadow, 2026-11-16 (lane REP)

Step 3c-i of [the stage 3 design delta](2026-11-15-rep-adt-stage3-design.md). It follows
[3a's end-of-emit shadow](2026-11-15-rep-adt-stage3a-shadow.md). It is the first half of 3c, "the
code is derived". Every read of a field code now goes through one reader. When armed, that reader
compares the stored code with the code its storage type derives, at the moment of the read.

## Why a second shadow

3a sweeps the tables once, after emit. A row can disagree mid-emit and still agree by the end,
for example where a re-lay writes the code before it writes the storage type. A read in that
window would change behaviour once 3c-ii derives the code, and the end-of-emit sweep cannot see
it.

## The change

- **`fieldCodeIn(codes, tys, r, site)`** (`emit_rep.vl`) returns `codes[r]`. Under
  `$VL_REP_SHADOW` it also counts one (site, verdict) pair against
  `fieldCodeOfRep(repOfTy(tys[r]))`. `fcShadowSweep` reports those pairs as `fieldRead` buckets.
- **Every direct read goes through it.** That is 22 read sites, among them `sFieldTypeAt`,
  `fieldRowCode`, `armRowCode`, `variantFieldTypeAt`, `rowsStoreAlikeIn`, `fieldRowKindIn`,
  `fieldPosCode`, the layout id, the re-lay tests, `famRelayStructRow` and `rowMintFrom`'s copy.
  `emit_row_dump.vl`'s debug dump still reads the column directly.
- `fieldCodeOfRep` moves from `emit_fc_shadow.vl` into `emit_rep.vl`, and `fieldCodeOfListRep`
  moves from `emit_list_rep.vl` with it, so that the reader can derive without an import cycle.
  3c-ii adopts both as the derivation.

## Readings

Measured on master `e1f7f37c6` plus this change, armed. The population is the 12,172 distilled
cells (`cells/` and `named/`) plus the self-build.

| | reads | disagree |
|---|---|---|
| self-build | 326,894 | **0** |
| distilled cells and named | 183,686 | **28**, all in `d681_refused_spelling_pin` |

| `tests/cases` and `std` (8,259 modules) | 411,687 | **1,016**, in 22 files |

**The distilled corpus does not hold every class.** On `tests/cases` and `std` the end-of-emit
sweep also disagrees: 13,314 rows agree, 46 are template rows, and **18 rows disagree, in 12
files**, all of them `anon` rows. By read-time verdict:

| class | stored | derived | reads | files | example |
|---|---|---|---|---|---|
| A. a function-set field: an open function type stored as a set id | 0 | -2 (no rep) | 610 | 16 | `set-in-record-literal-handed-to-hole-callee.vl` |
| B. a function field the rep calls a set id, stored as a closure | 14 | 0 | 49 | 3 | `record-map-fn-field-two-results.vl` |
| C. an empty list joined with `null`, with a hole element | 18 or 4 | -2 (no rep) | 357 | 3 | `empty-list-join-null-field.vl` |

A scratch compiler whose reader returns the derived code (never seeded) loses 11 `tests/cases`
modules and changes 2 more. Classes A and C are the 11 lost modules. A and B make the field code a
function of the function-storage decision, not only of the type. That is the "code that is not a
function of its type" risk the design named.

The end-of-emit sweep over the distilled population finds 13,647 rows: 13,644 agree, 0 have no storage
type, and 3 are `template -> not emitted`, all in `d681`.

**Finding: the template rows are read.** All 28 disagreeing reads are `stored=0 derived=-2
rep=none`, on the anonymous rows that `add` and `addx` mint outside every instance. The readers
are `fieldRowCode` (10), `storeAlike` (10), `sFieldTypeAt` (6) and `layoutId` (2). The 3a note's
assumption that no emitted code reads these rows is wrong. They are read, and the stored 0 is the
answer those reads see today. The cell runs correctly.

So 3c-ii cannot simply derive -2 for these rows, nor for classes A to C. Before it merges, one of two things happens:
- the template stops minting the rows, if every read is a dedup or layout probe that an instance's
  own row answers; or
- the derivation names the template's answer explicitly.

The next step decides which, by finding which of the 28 reads reach emitted bytes.

## Cost, unarmed

| | |
|---|---|
| corpus `cmp` (`corpuscmp.vl`, `tests/cases` and `std`) | 8,259 modules: 6,909 identical, **0 DIFFER, 0 LOST** |
| distilled cells and named, built with both seeds | 8,893 buildable: **8,893 identical, 0 LOST, 0 GAINED** |
| self-build | fixpoint |
| seed size | 6,349,140 → 6,351,464 (+2,324 bytes) |
| L2 self-compile fuel | 89,769,647,075 → 89,795,259,391 (+0.03%, the reader's call) |
| net compiler lines | +130 (about half of it import re-wrapping) |
| pin-helper delta | 0 |
