# Step 7, lane H: the rep-classifier census's NAME column graded; the lowerability walk by type, 2026-11-12

The coordinator handed lane H the rep-classifier census's NAME column. On master `68905c69`
(`vl run scripts/rep-classifier-census.vl -- --reads NAME`) it reads 23 classifiers on 50 call
sites, with ARENA + NAME 4 and SPELLING 1. This note gives each classifier an owner and a grade,
converts the one lane H owns, and writes the contract sentences for the classifiers that read a
name only as a label.

## The lowerability walk, by type

`funcTypeShapeLowerable` (`emit_shape_intern.vl`) decides whether a record lowers as a closure's
result or parameter. It split the shape's spelling into field names and texts
(`shapeInnerFieldSplit`) and asked each field's code. It now walks the record type's `TyObj`
fields. The field text it handed on was used only in two places:

- `nameFieldCodeTy`'s compact-spelling rung, where an empty text reads as compact;
- `isUNameKeyAB`'s armed tally.

**Probe** (scratch compiler, 24,070 programs, accumulator emptied per program, control checked),
comparing the spelling walk against the type walk at every call:

| spelling walk | type walk | programs |
| --- | --- | --- |
| lowerable | lowerable | 276 |
| not lowerable | not lowerable | 48 |
| any disagreement | — | 0 |

The callers keep their gate. `structElemArrayLowerable` and `funcRetUnrepresentable` ask whether
the nominal render is an inline shape (`nameIsShapeOpen`) before walking. That gate separates a
declared struct, which is laid out by its declaration, from an inline record: declaration
identity, not a spelling's rep.

**Measurement:**
- **Sweep** (`sweep.vl diff`, master `68905c69` against this, fixpoint seeds on both sides):
  24,195 same, 0 bytes-only movers, 0 output movers, 0 `runs → not-runs`, 0 new compiler traps.
- **rep-classifier-census:** NAME 23 → 22 classifiers (50 → 47 call sites); SPELLING 1 → 0.
  The emitter has no classifier left that reads a spelling.

## The NAME column, by owner

**ARENA + NAME (4):**

| classifier | the name read | owner / grade |
| --- | --- | --- |
| `monoTagMapRepName` (emit_mono) | renders a tagged map's or record's stored spelling | lane D, pin names |
| `retFlagsSeedResult` (wasmEmit) | `tyNameOf(fn.fnRet)`: the union name the return boxes as | lane G, union names |
| `unionNameOfCall` (emit_classify) | union-name producer; `isValueUnionName` of the inferred name | lane G |
| `annTyIsRefList` (emit_collect) | `nd.tyName == ""` only | **contract**, below |

**The rest (18), by owner:**

| owner | classifiers |
| --- | --- |
| lane G, union names | `coalesceResultUnionName`, `unionRetName`, `unionNameOfHoleReadGo`, `nameIsPlainScalarAtom`, `directArgSeedsOf`, `emitCapturedCall`, `emitLetDeclStmt` |
| lane D | `monoSlotParamPins` |
| lane E | `annShapeIndexOf`; `shapeFieldElemName` and `rlElemStoredName`, reassigned from lane F (whose cuts made their ref-list and map arms type-only) |
| lane H, converted here | `funcTypeShapeLowerable` |
| lane H, the nominal gate kept (above) | `structElemArrayLowerable`, `funcRetUnrepresentable` |
| unowned, probe next | `listAnnNameOf` |
| contract, below | `emitUnionLitIs`, `flatHasSubWordField`, `elabArgRepins` |
| floor | `nulNicheIsTestImpossible`, a diagnostic render (render-parse's floor) |

`listAnnNameOf` (emit_closure_sites) returns a list binding's annotation text. Its premise is "inside
a monomorphized instance the checker never typed the cloned body". Step 1's per-instance node
types may have retired that premise; it is probed next.

## The contracts

- **`annTyIsRefList`:** the name is read only to tell a written annotation from an unwritten
  parameter node; `TypeRef` records nothing else for that. The rep comes from the annotation's
  type.
- **`emitUnionLitIs`:** `nameIsQuotedLeaf` classifies a source literal's lexeme (string, float
  or integer), not a type's spelling.
- **`flatHasSubWordField`: a gap, not a contract.** No DECISIONS entry rules that a `flat`
  field's sub-word width is a storage attribute of the declaration rather than of its type.
  The rule is stated only in the checker's `flatStorageSpellWidth` comment and the 2026-11-11
  lane-B note. The arena has `u8` and no `i8`, `i16` or `u16`. Probing that showed every
  sub-word field types as `u8`: a legal `i16` literal is refused with a `u8` range message. A
  computed value is not narrowed, unlike a `u8[]` element. Filed as D15978; the owner ruled
  storage semantics (DECISIONS, "A sub-word field of a `flat` record has storage semantics").
  The name read stays until the arena has a type per width. The nested `flat` lookup by its declaration's name
  (`flatDeclByName`) is declaration identity.
- **`elabArgRepins`:** a bare type-parameter annotation is identified by its declared name in
  `fnTyParams`, which is a type parameter's identity.
