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
| `emitObj` → `emitStructFieldValueUnder` → `fieldRowKindIn` | type parameter | 16 | open, below |
| `cloValueCallRetKind` → `structFieldIsClosure` → `fieldRowIsClosure` | type parameter | 10 | open, below |
| `readStoreAt` → `readFieldStoreKind` | type parameter | 1 | open, below |
| `memberUnionFieldNameReadGo` → `fieldRowIsUnionBox` | type parameter | 1 | open, below |
| `bindCellGo` → `letSpellsNulAtom` / `exprIsLitAtom` → `fieldRowIsNulAtom` | unresolved element | 3 | D15976 |
| `emitObj` → `fieldRowKindIn` | unresolved element | 1 | D15976 |

## The floor: layout only

**12 programs.** Lane F's accepted contract covers these rows: "a type that holds a type
parameter is not a rep; a template's row is keyed by its open type, each instance's by its closed
type".
- Such a row is laid out, and twin- and prefix-compared, from its field codes.
- No value is read through it.
- The coordinator ruled them a floor.

## Open: a value read of a type-parameter row (28 programs)

The row comes from `structIndexOfObjCtx`. A probe tagged each rung that returned a row with a
type-parameter field:

| rung | in a function emitted as its generic original | in an instance |
| --- | --- | --- |
| mint (`sLitMintRow`) | 798 programs | 1 |
| adopted (`litRepTyAt`) | 83 | 0 |
| tag id (`sLitIdRow`) | 67 | 0 |
| tagged field (`objLitTaggedFieldRow`) | 15 | 0 |
| alias (`structIndexOfTy`) | 3 | 0 |

Open rows are chosen in 910 programs. In all but one, the function is emitted as its generic
original (`fnInstOrigin < 0`), with no instance. D15404's `mid2<F, G>` called at `same` is one:
G is inferred and never closed. So the 28 programs whose field readers meet the open field
mostly have no closed instance type to read. The one true instance is
`closures/two-returns-records-of-hole-fns-field-called.vl`, at the mint rung.

Whether an original emitted with open type parameters is a floor or a conversion is with the
coordinator. The codec fallbacks stay until it rules. The row selection is lane B's.

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
