# Step 7, L6: the struct name producers, cut 2, 2026-11-12

This cut follows lane I's floor audit (closing census 5), which failed these of lane B's floors as
mechanism, not contract. It also takes the coordinator's addition, `sRowsTwin` (D15880). Measured
on master `dc0f2826` (#7644) with the sweep's 24,189 programs. Probes are accumulating: every
site marks itself, and `emitProgram` reports all the marks.

## Unreached, deleted

| producer, at its caller | programs where it answers |
| --- | --- |
| `rowCanonIdOfName`, in `sigElemCanonId` and in `jrCanonFits` | 0 |
| `structRowOfSpelling(ma)`, `memberUnionFieldName`'s untyped path | 0 |

`rowCanonIdOfName` is deleted. `sigElemCanonId` keeps only `repNameCanonId`. `jrCanonFits` went
with #7644. `memberUnionFieldName` asks only the member type.

## Converted

**`objNestedFieldCompat`** fitted a nested literal against the row `structRowOfSpelling` gave
for the variant field's element name. It answered in 74 programs. It now takes the field's
element type (`uFieldElemTyIxAt`) and its row (`structRowOfValueTy`). The sweep is unchanged.

**`sRowsTwin`** judged two struct rows one canonical record when their field names, codes and
element **names** agreed and their types were `tySame`. The probe:

| | programs |
| --- | --- |
| `sRowsTwin` answers true | 386 |
| element names differ where element types are `tySame` (the typed answer would join the rows) | 27 |
| the other way round | 0 |

The name was there for a reason, which its comment gave: a list of function ids and a list of
closures hold one element type at two storages. Switching to `sFieldElemSame` (`tySame` of the
element types) cost 3 programs. Each went runs → compiler trap with an invalid module:

- `closures/fn-nested-record-field-list-written`;
- `closures/record-literal-written-into-slot-of-fn-widened-binding-runs`;
- `closures/returns-of-record-lists-of-different-fn-sets-called-through-result`.

A tagged function set rides on the type INDEX (`fnTagSetOfTy`, `elabFnSetTy`). `tySame` does not
compare it, and neither does `repCanonId` (tried; same 3 traps). So the typed test is
`sRowElemRepSame`: `tySame` of the element types and the same function set at every function
position, walked in step through list elements, a nullable's inner type, map values, record
fields and union members (`fnSetsAgree`, over an exhaustive `fnSetParts`). With it the 3 programs
are byte-identical again.

**For §3.3's equality contract:** two types can be `tySame` and still need different rows when
their function positions carry different tagged sets. The set is attached to the type index, so a
row decision that compares types must compare the sets as well (`fnSetsAgree`).

Under structural typing two same-shape rows are already one type. Keying the twin test by type
is therefore the contract, and the function set is part of a function type's storage.

**The no-element slot reads no name either.** A slot with no recorded element type compared
element names. That path was reached in 692 programs, and the names differed in 19. A probe
printed both slots in every one of the 19. Each is a code-0 field that is an interned atom on one
side (`K`, `"a" | "b"`, whose element type is recorded) and a plain scalar on the other, with no
element at all (name `""`, type −1). So "no recorded type" means "no element", not a lost type.
The rule is now: a slot with no element type matches only another such slot. Against the name
fallback it is byte-identical over the sweep (24,192 same), and `sRowsTwin` reads no name.

## Proof

- Refresh ×2 is a fixpoint at 6,711,300 bytes, against master's 6,710,159.
- Sweep against master's fixpoint seed: 24,189 same and **3 bytes-only movers**, the twins that
  now merge: D627's witness, `maps/map-value-layout-twin-heap-merge` and
  `unions/error-arm-struct-equality-mixed`. 0 output movers, 0 `runs → not-runs`, 0 new traps.
- `rep-fuzz-check` exact. lint-self is clean (kind-ladder 0), and `regress.vl` lost no runs.
- Witnesses `--strict`: 4,859 as filed, 0 moved.
- Late demands 8, seed +1.9%, render-parse 9 and 10, arena-scan 21, dead exports 0, and
  plumb-shape cost passes.

## Left of the struct and variant name producers

- **Taken by lane I:** `structRowOfSpelling` and `spellingHasStructRow` behind `isSName` (1,707
  programs), and `elemNameIsNominalAt` (1,777).
- **Mine, still open:** `armFieldStructRow` (2 callers), `structRowOfAnnTyGo`'s nullable branch,
  `structIndexByName`'s sites outside the `#anon` handles, and D15958.
- `monoTagMapRepName` is lane D's.
