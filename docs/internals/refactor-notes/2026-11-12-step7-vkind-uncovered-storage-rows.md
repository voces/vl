# Step 7, lane H: the field rows with no covered storage rep, graded, 2026-11-12

After #7650, lane I's four field-code floors still ask the code only for a row whose storage type
the rep descriptor does not cover:

- `fieldRowKind`;
- the order stash's `200 + code`;
- `sFieldStoreKind`;
- `fieldCodeCellKind`.

This note grades every such row in the sweep population (24,070 programs). The census is from
cut 4's note (`2026-11-12-step7-vkind-ladder-list-arms-by-rep.md`): a type parameter in 40
programs, and a `T[] | null` whose element is unresolved in 4. All 44 programs run, with correct
output.

## Instrument

A named probe compiler, never refreshed into a seed, trapped at `rowStoreRepIn`'s uncovered
branch, so each program's backtrace names the reader. A second build skipped the four layout
consumers:

- `tsStruct`, the type section;
- `structFieldCodesEq`, twin equality;
- `structRowIsProperPrefix` and `structRowPrefixCheap`, the subtype prefix.

A trap in the second build is a value read.

| first value reader | storage type | programs | grade |
| --- | --- | --- | --- |
| none (layout only) | type parameter | 12 | **floor** |
| `emitObj` → `emitStructFieldValueUnder` → `fieldRowKindIn` | type parameter | 16 | **floor** |
| `cloValueCallRetKind` → `structFieldIsClosure` → `fieldRowIsClosure` | type parameter | 10 | **floor** |
| `readStoreAt` → `readFieldStoreKind` | type parameter | 1 | **floor** |
| `memberUnionFieldNameReadGo` → `fieldRowIsUnionBox` | type parameter | 1 | **floor** |
| `bindCellGo` → `letSpellsNulAtom` / `exprIsLitAtom` → `fieldRowIsNulAtom` | unresolved element | 3 | D15976 |
| `emitObj` → `fieldRowKindIn` | unresolved element | 1 | D15976 |

## The floor: type-parameter rows (40 programs)

**The contract (coordinator ruling):** "a type that holds a type parameter is not a rep; a body
emitted with open type parameters builds at the open row, whose field layout comes from its
code". It is lane F's contract applied to what step 2 decided: the checker owns the instance
set, and a function it does not instantiate is emitted once as its original, its type
parameters open.

- **12 programs read the row only for layout:** the type section, twin equality and the
  subtype prefix.
- **28 read a field's value kind through it,** from a body emitted as its original. Where the
  row comes from: `structIndexOfObjCtx` chose a row with a type-parameter field in 910 programs.

| rung | in a function emitted as its generic original | in an instance |
| --- | --- | --- |
| mint (`sLitMintRow`) | 798 programs | 1 |
| adopted (`litRepTyAt`) | 83 | 0 |
| tag id (`sLitIdRow`) | 67 | 0 |
| tagged field (`objLitTaggedFieldRow`) | 15 | 0 |
| alias (`structIndexOfTy`) | 3 | 0 |

D15404's `mid2<F, G>`, called at `same`, is one: G is inferred and never closed into an
instance. All 910 programs run with correct output. Closing an original's type parameters at
emit would be a step-2 / mono change, out of step 7's scope.

**The one true instance:** `closures/two-returns-records-of-hole-fns-field-called.vl` (mint
rung) is not among the 44 programs. No field codec meets an uncovered field there, so nothing on
the codec side converts. Its row choice is handed to lane B's row selection.

## The unresolved element: D15976

An un-annotated `[]`-or-`null` join held in a record field reaches emit with its element hole
unfilled. That is a checker-side gap, not a rep question: the coordinator's ruling. It is filed
as D15976 and is not converted in step 7.

## `optLeafKindOf`

**`optLeafKindOf` (`wasmEmit.vl`) is a codec over an enumeration, not a spelling.** It maps
`fieldRowNumKind`'s numeric kind (0, 3, 4, 5) and the string flag to a leaf kind. Each input is
read off the field's storage rep (`numKindOfRep`, `strOfRep`) where one covers it. Its `i32` arm
excludes the `K | null` atom niche, which the bare kind does not record. The coordinator accepted
this sentence as its contract.
