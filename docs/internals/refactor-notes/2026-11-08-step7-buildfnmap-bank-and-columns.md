# Step 7: `buildFnMap`'s resume bank, and what stands of the map

Measured 2026-11-08 on a 4-core box, master `0cfd71c8`. Both seeds are fixpoints (two
`refresh-compiler.sh` runs byte-identical). The sweep population is 23,720 programs.

## The resume bank (this PR)

`monoRegisterInstance` arms `buildFnMap` once per minted instance. The armed call kept the
covered `fnStmts` prefix and wrote the `fmSeed*` bank back over its five return columns. It
also retired the prefix whenever one of seven registry lengths moved (`fmSeenUnSets` …
`fmSeenTyParams`).

| ablation | sweep |
| --- | --- |
| A1: the resume keeps the prefix rows, no reseed | same (23,720) |
| A2: A1, and the resume ignores the registry stamps | same (23,720) |

The reason is structural. `buildFnMap#2` is unarmed, so it re-classifies every row after
monomorphize, and no row a resume kept reaches the emitter. The kept rows are read only by
mono's own rounds, and nothing those rounds decide moved.

Deleted: the five `fmSeed*` arrays, `buildFnMapReseedPrefix`, `buildFnMapBankRow`, the seven
registry stamps, and `fnNames` and `fnIndices`. The last two were read only by
`buildFnMapNoteFnStmtWrite`, which now reads the old declaration in `fnStmts[slot]`.

| | base | candidate |
| --- | --- | --- |
| seed bytes | 6,580,497 | 6,577,698 (−2,799) |
| L2 self-compile fuel | 78,757,799,076 | 78,748,560,694 |
| rep-fuzz | exact | exact |

## What stands, and why

**The annotated return columns.** A probe compared each annotated valued function's columns
(`buildFnMapRowOfRetAnn`) with `frsColsOfTy` over its recorded-or-annotated type, after
`fnRetColsFromRecorded`. Over the population, 2,435 programs disagree. Digits are folded in the
class names below:

| class | functions | programs |
| --- | --- | --- |
| kind `iNlist` vs `i32` | 2,381 | 803 |
| ref-list row named vs -1 | 1,330 | 1,182 |
| atom recorded, column 0 | 341 | 203 |
| kind `variant` vs `i32` | 227 | 150 |
| slot `struct`, rows differ | 173 | 103 |
| kind `uNlist` vs `i32` | 129 | 108 |
| slot `nulvariant`, rows differ | 113 | 36 |
| 15 more classes (14 kind or slot, 1 no token) | 458 | — |

The compiler itself has 205 disagreeing functions. These are mostly not wrong answers.
`retAnnKindChain` leaves an `i64[]`, `u8[]` or variant annotation at `i32` on purpose, and the
readers reach the annotation directly. So a switch to `repOf(annotation ty)` changes what
each of the 72 `fRetKind` readers is handed. It has to go reader by reader, and it is not a
byte-identical deletion of the map.

**The name and sid maps.** `fnIndexBySid` and `nestedNameBySid` resolve a callee by its
interned name, with first-wins and the scope-chain walks in `emit_local_scope.vl`. Making them
"a lookup on the declaration" means moving those walks onto `identDeclOf`, which is the same
change for every by-name read in the emitter. That is not this map's own deletion.

**`collectA#2`** is the post-mono arena scan that sets the presence flags and interns the
ref-list, map-value and annotation rows the type section is built from. Its readers are the
type section's order, so deleting it means interning on demand from `repOf`, which reorders
the type section. No byte-identical slice of it was found here.

**`vtKindOfType`** is already `repOfNode(ann).rdKind`. What is left of the ladder is three
floors: the `null` type, a nullable numeric literal union with no recorded type, and `i32`
for an uncovered node. There are also `repOfNodeAt`'s two node recoveries, the union alias
and the hole element. Not measured here.
