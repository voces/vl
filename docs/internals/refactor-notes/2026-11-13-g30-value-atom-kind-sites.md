# Step 7: the five unreached `valueAtomKind` sites in wasmEmit, read by type, 2026-11-13

Lane G. H's render-parse census left five `ty-parse-unclassified` sites in `wasmEmit.vl`, each a
`valueAtomKind` over a spelling, none reached by a corpus program. Each now reads a type.

| site | was | now | exact? |
| --- | --- | --- | --- |
| `valueKindIsPlainScalar` | `valueAtomKind` over 8 spellings | `boxTagOfPrim` over a `PrimName[]` | yes: `u8` gave -1 both ways and is dropped |
| `emitNumExactCastFrom` (`as?` box tag) | `valueAtomKind(asExprNumTgtName(ix))` | `asExprNumTgtKind(ix)` = `boxTagOfPrim(primNameOf(tyPeelNul(nodeTyIxOf(ix))))` | yes: same node type, before it is rendered |
| `emitHoleNumAsOpt` | same | same | yes |
| `xrepElemEq` (box against a number) | `valueAtomKind(arm name)` | the `aks` column `unionBoxEqColumns` builds from the member types | kinds agree on every number arm; the column also gives a kind to an arm whose name has none |
| `emitUnionConcreteNumCross` | row member types, else `unionArmsOf(uname)` names | row member types (unchanged), else `unionTyMemberTys` of the box's read type, else a loud floor | see below |

## `emitUnionConcreteNumCross`

No spelling I tried reaches it. `(i64 | null) == i32`, `(i64 | string) == i32` and D15090's witness
are answered before it by `eqHasArm`; `(i32 | string) == f64` and the other cross pairs are
refused at check. `xrepElemEq`'s box-against-number path is likewise unreachable: a list of a
number union is refused at check as not equatable.

Forcing controls, all on throwaway builds:

| build | `d.vl` (`(i64\|null)==i32`, `!=`, `(i64\|string)==i32`, null) |
| --- | --- |
| caller forced into NumCross, row branch kept | `false true false false` |
| caller forced, row branch skipped (typed path) | byte-identical to the row build on all three probe programs |
| caller forced, row and types both skipped | `emitProgram: a union compared with a number has no member types to read its arms from` |

The forced `false` answers are the forced caller's: the operand's kind is the union's `i64` arm,
which NumCross skips by contract.
