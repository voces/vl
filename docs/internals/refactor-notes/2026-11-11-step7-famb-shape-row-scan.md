# Step 7 slot layer: the shape-row scan's callers read the spelling's type, 2026-11-11

The shape-row scan (`shapeRowScanK` → `shapeFieldTypeCompatK`, `emit_shape_rows`) matches a
shape spelling `{x: i32, y: i32}` against the struct table by field-name set. It then guards
each field by classifying its type *string* (`nameFieldCode`, `nameIsElemArray`,
`nameIsMap` with no type). It is reached only through `structIndexOfTypeName`. This PR finds
who reaches it, and moves the two struct-row questions that only need a yes or no onto the
spelling's resolved type. The scan stays as the floor for a spelling that resolves no type.
Base is master `2842f92a` (#7168).

## Method

The probe compiler was built from base and never refreshed into `build/`. Each caller of
`structIndexOfTypeName` set a caller tag. Where the scan ran, the probe recorded:

- the caller;
- the pass that answered, or `miss`;
- for a caller holding a type, whether `repRowOfTyStruct` of that type agreed;
- whether the spelling's own resolved type, `structRowOfRecordTy(fieldElemTyIxOfName(name))`,
  agreed. `parse=` means it agreed, `parse!` another row, `parse-` no row, `parsenoty` no type.

Each program reported once, at the end of `emitProgram`. The sweep covered 23,900 programs.
Counts are **programs**:

| caller | reaches the scan | `parse=` | `parse!` | `parse-` | `parsenoty` |
| --- | --- | --- | --- | --- | --- |
| `isSName` (`emit_nullable_rets`), a yes or no | 307 | 244 | 30 | 9 | 34 |
| the element-base check (`emit_shape_rows`, a `<Struct>[]` spelling's base), a yes or no | 26 | 26 | 0 | 0 | 0 |
| `structIndexOfTypeNameTy`, holding a type | 0 | — | — | — | — |
| `structIndexOfTypeNameTy`, no type | 1 | 1 | 0 | 0 | 0 |
| `structRowOfSpelling`, past the 4,096 parse cap | 0 | — | — | — | — |
| untagged: a call nested in a tagged one, after the inner call cleared the tag | 15 | 15 | 0 | 0 | 0 |

A program can count under several columns, and 333 programs reach the scan at all. No caller
that holds a type reaches it: `structIndexOfTypeNameTy` answers from the type's own and
canonical rows first.

## What changed

`spellingHasStructRow(name)` (`emit_shape_rows`) answers whether a spelling denotes a struct
row:

- a declared struct by name;
- else, for a whole record shape, whether the type the spelling resolves to has a row
  (`structRowOfRecordTy`);
- else, where the spelling resolves no type, the field-set scan, as before.

`isSName` and the element-base check now call it. Both ask only whether a row exists, so a
`parse!` program (another row) gives the same answer.

## Measurement of the change

The candidate and base were each swept over the 23,900 programs. All 23,900 are the same,
module bytes included. The programs where the boolean could differ (`parse-`, and `parse!`
on a `miss`) build the same module either way: a later reader decides from the type.

## What is left

- **The scan stays as the floor for 34 programs.** There the spelling resolves no type
  (`parsenoty`), so no type is there to thread. It also stays for a spelling past the parse cap.
- **The field guard's string classification** (`shapeFieldTypeCompatK`) now runs only on
  those floor spellings. Threading a type there needs a type, and these spellings are the
  ones that have none.
- `structIndexOfTypeName` keeps its other callers, which reach it after their own type rungs.

## Proof

- `regress.vl`: no runs lost. `lint-self`: clean. Seed size: +0.4% on its baseline.
- The `sweep` label re-proves the population. Expected movers: none.
