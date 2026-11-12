# Step 7: the field element-name column's readers graded, 2026-11-12

`sFieldElemName` (struct rows) and its arm twin `armFieldElemName()` record, for each field, a
spelling: the union, nested row or literal set the field holds. Every field now also records its
arena type, `sFieldStoreTy` (w314's census: on every typed, covered row the type agrees with the
code). This note grades each read of the spelling column by what it needs:

- **(a)** it already holds the field's type and only hands the name to the union registry, so it
  converts when the registry names its row from the type (w316's C3);
- **(b)** it needs the name for something else: a row-identity compare, a presence test, or a
  row lookup by name;
- **(c)** no program reaches it.

The population is the sweep's 24,006 programs, master `a8bc40d3`. Every read was wrapped by a probe
that tagged its reach and whether the value was empty. The probe was validated on
`arm-element-list-mutation`, which answers the arm-agreement sites E42–E46. Reach counts programs.

## (a) the name is a union-registry key, handed over beside the field's type

| site | function | reach |
| --- | --- | --- |
| E4, E5, E6 | `memberUnionFieldName` (`emit_classify`) | 1,205 · 53 · 10 |
| E8 | `armFieldUnionName` | 621 |
| E50 | `emitStructFieldValueUnder` (`wasmEmit`) | 975 |
| E51 | `emitVariantFieldBox` | 738 |
| E49 | `emitOmittedFieldNull` | 557 |
| E62, E63 | `emitCoalesceUnionField` | 290 · 25 |
| E61 | `emitStructFieldStoreValue` | 109 |
| E26 | `sharedFieldArmValueBox` (`isValueUnionName`) | 37 |
| E24, E25 | `sharedPlanBoxName`, `sharedPlanOneBoxName` | 14 · 6 |
| E59, E60 | `emitStructEqFieldAt` | 5 · 13 |
| E53 | `variantBoxFieldComparable` | 1 |
| E55 | `emitVariantFieldEqCoreAt` | 1 |
| E23 | `monoArgTyNameProjected` (`emit_mono`, w317's) | 4 |

## (b) the name does something other than key the registry

**Row-identity compares.** Two rows or arms count as the same layout when their element names are
equal. Each converts to a compare of the two stored types, as `annShapeIndexOf`'s dedup did
(`2026-11-11-step7-l2-shape-dedup-by-store-ty.md`). A field with no stored type keeps the name.

| site | function | reach |
| --- | --- | --- |
| E44, E45 | `variantRowFieldsMatch` (`emit_union_atoms`) | 4,032 |
| E42, E43 | `variantRowAgree` | 3,455 |
| E46 | `armStageAgree` | 3,429 |
| E1, E2 | `sRowsTwin` (`emit_atom_kinds`) | 1,055 |
| E10 | `objMatchesVariantIdxOmit` (passes the column on) | 76 |
| E27, E28 | `structFieldCodesEq` (`emit_rep`) | 58 |
| E38, E39 | `variantLitPairKind` | 48 |
| E47, E48 | `variantRowsTagEqual` (`emit_variant_sig`) | 37 |
| E34 | `shapeRowScanK` | 34 |
| E40, E41 | `sigFieldMayMatch` (already a canonical id of the name) | 32 |
| E17, E18 | `variantFieldTysEq` (`emit_collect`) | 18 |
| E57, E58 | `sharedFieldPlanDispatchable` (an atom-set identity test across arms) | 11 · 6 |
| E29 | `annShapeWiderRowOf` (`unionSetNamesAtom`) | 4 |
| E31, E33 | `shapeRowSetId`, `annShapeIndexOf` (the spelling index, kept for untyped shapes) | 6 |

**Presence tests.** "Does this field record an element?" reads the name's emptiness. Each converts
to a test on the stored type.

| site | function | reach |
| --- | --- | --- |
| E32 | `shapeRowLayoutId`'s atom bit (#7414) | 1,575 |
| E13, E11 | `refListKeptSlotOfMember` | 22 · 1 |
| E54 | `variantRefListFieldSlot` | 2 |

**Row lookups by name.** The name finds a nested row, slot or mint. Each converts where the stored
type has a row by type (`structRowOfRecordTy`, `repVariantShapeRowOf`), and is a floor where the
row is minted under the spelling (the shape walk's class).

| site | function | reach |
| --- | --- | --- |
| E15, E14 | `leqNoteStructRowFields`, `leqNoteVariantFields` | 13 · 2 |
| E19 | `eqgFieldRefSlot` | 4 |
| E56 | `variantNestedRow` | 3 |
| E20 | `variantFieldElemNameOr` | 2 |
| E36, E37 | `sFieldRefSlot` | 1 |
| E16 | `armFieldStructRowMinted` (interns by the name: the walk's floor) | 1 |

## (c) no program reaches it

Four are early-return rungs. An earlier rung answers each one in every program the sweep holds,
and in the plainest programs written to reach it, so they are deleted:

- E7, `memberUnionFieldName`'s union-member arm rung. Probed with a `Cat | Dog` receiver reading a
  shared union-box field, in three spellings.
- E9, `armFieldUnionName`'s nullable-receiver rung. Probed with a `Cat | null` receiver under its
  null test, in two spellings.
- E12, `refListKeptSlotOfMember`'s receiver-arm rung. Probed with an arm-typed receiver's ref-list
  field.
- E52, `isStrTagUnionNameOf`'s optional-chain rung. Probed with `o?.f is string`.

On both seeds those programs build byte-identical modules.

The other three sites stay:

- E21 and E22 (`variantFirstLayoutDisagreeField`) and E30 (`annShapeWiderRowOf`'s untyped compare)
  are compare guards. Deleting one changes what counts as "same" for a program the corpus lacks,
  so they convert with the row-identity compares instead.
- E35 is an argument to a call no program makes.

## Not readers

The accessors (`sFieldElemNameAt`, `variantFieldElemName`, `armFieldElemName`), the writers
(`armFieldStructRowMinted`'s store, `promoteLitFieldToAtom`, `demoteLitFieldToString`,
`famRelayStructRow`, and `variantRowAgree`'s and `armStageAgree`'s swaps), and `tyRegGenNow`'s
length read.

## The row-identity compares, converted

One rule, `fieldElemSame` (`emit_state`): two field slots hold one element when their recorded
element types are the same type, and by their element names only where a type is missing.
`sFieldElemSame` and `armFieldElemSame` apply it to the struct and arm columns. These sites now
use it: `variantRowFieldsMatch`, `structFieldCodesEq`, `variantLitPairKind`,
`variantRowsTagEqual`, `variantFieldTysEq`, `variantFirstLayoutDisagreeField`, `sigFieldMayMatch`
and `sharedFieldPlanDispatchable`.

- **`sRowsTwin` keeps the name.** Keyed by type, it merged a row holding a list of function ids
  with one holding a list of closures. The two hold one element type at two storages, and only the
  name records which. The result was invalid wasm in `closures/fn-nested-record-field-list-written`
  and `record-literal-written-into-slot-of-fn-widened-binding-runs`. That site was found by reverting
  each file in turn.
- **`annShapeIndexOf` and `annShapeWiderRowOf` stay inline.** They already follow the rule with
  stored types. Their name fallback calls `shapeFieldElemName`, which can intern a deferred
  element, so it must stay lazy.
- **`variantRowAgree` and `armStageAgree` are normalizers, not compares.** They rewrite one name
  to the other where the types are the same, and they go when no reader is left.

The record-field box sites `emitStructFieldValueUnder` and `emitStructFieldStoreValue` hand
`emitUnionBoxOwed` `""`: `boxDstName` derives the box from the field's type at both, in every
program.

Eight programs build different bytes and print the same on both seeds:

| program | output |
| --- | --- |
| `named/d15204_run_list_in_record_written` | `1.5` |
| `named/d15204_run_record_in_list` | `4` |
| `named/d15220_cell_field_of_id_lists` | `4` |
| `named/d15296_nested_list` | `5` |
| `closures/fn-tagged-ids-in-records-in-nested-lists` | `4 4 4 4` |
| `closures/fn-tagged-records-held-lists-of-two-depths` | `4 4 4` |
| `closures/hole-fn-nested-list-in-record-field` | `4 6 9 1.5` |
| `closures/hole-fn-nested-list-record-field-tagged` | `6 6 6 4` |

## Order

1. (c): delete each unreached rung, with a control.
2. (b) row-identity compares: by stored type, one PR, the sweep to grade.
3. (b) presence tests and row lookups: by type, with the walk's spelling-minted rows as the floor.
4. (a): one PR, as C3 lands.
