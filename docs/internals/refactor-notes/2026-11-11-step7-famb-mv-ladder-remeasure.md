# Step 7 slot layer, family B, item 4: the map-value kind ladder re-measured after #7134, 2026-11-11

This is item 4 of the series in `2026-11-11-step7-famb-decl-identity-census.md`. The census put
three sites under "the mv kind ladder" (1,099 programs on base `98b73ba7`):

- the struct rung of the map-value kind ladder;
- the ladder's variant rung;
- `structRowOfNameTy`'s own variant test.

It deferred them to #7134, which reads the kind off the type for every caller that holds one.
This note measures what is left on master `ada32709` (#7137, after #7134). Nothing in the
compiler changes.

## Method

The probe compiler was built from master's source plus the probe, and never refreshed into
`build/`. It noted:

- `L` when `mvValKindOfSpelling` reached its record rungs;
- `S` when the struct rung fired (`structRowOfNameTy(valName, -1)`);
- `V` when the variant rung fired (`variantIndexOf(valName)`);
- `N` when `structRowOfNameTy`'s variant test returned -1. `N.diff` means the type alone
  (`structRowOfRecordTy`) would have given a struct row.

Each tag carried the name's Family B class:

- **MIX**: a declared record sharing its type (`tySame`) with a declaration of the other
  arm-ness.
- **ARM2**: a declared record sharing its type with an arm of another variant row.

Each program reported once, at the end of `emitProgram`, overriding any earlier emit error. The
control was the arm `Circle` beside a standalone `CircleC = {r: i32, t: i32 | string}`, with a
shared-field read `a.t` over `Circle | Sq`. It fired `N.fire@member N.diff:Circle
N.fambMIX:Circle`.

The probe was swept over all 23,882 programs (`scripts/sweep.vl record`). The 42 `N` programs
were then re-run with a caller tag. Counts are **programs**.

## Result

| site | fires | Family B name | caller |
| --- | --- | --- | --- |
| ladder record rungs reached (`L`) | 2 | — | `mvValKindOfSpelling`, untyped callers only |
| struct rung (`S`) | 0 | 0 | — |
| variant rung (`V`) | 1 | 0 | `tests/cases/maps/map-value-layout-twin-heap-merge.vl` |
| `structRowOfNameTy`'s variant test (`N`) | 42 (40 `N.diff`) | 5 (4 MIX, 1 ARM2) | `memberUnionFieldName` 36, the nullable-inner caller 5, the ladder 1 |

- **The mv kind ladder is closed for Family B.** Its struct rung never fires. Its variant rung
  fires once, on a name that shares its type with no other declaration. Before #7134 these
  rungs reached 1,099 programs. They now serve two untyped callers, and they go with those
  callers, not with a declaration column.
- **`structRowOfNameTy`'s variant test stands, by design, at the caller that carries Family B.**
  All five Family B programs reach it from `memberUnionFieldName` (`emit_classify`):
  - D15082 and `tests/cases/unions/discriminant-eq-ambiguous-name.vl` (MIX);
  - `discriminated-union-tag-read.vl` and `structs/one-literal-alias-field-one-record.vl` (MIX);
  - `shared-mixed-nullable-field-read.vl` (ARM2).

  There the name is a member atom of the union's own declaration (`unionArmsOf`), and that
  atom is the declaration identity. That is the census's "a declaration's own name" group. The
  answer "an arm has no struct row" is the one the ruling asks for, even where a same-type
  standalone has one.
- **The 35 other `N.diff` programs** are arms whose type has a struct row through an anonymous
  same-shape record, not a declaration. The arm's declaration decides there too.

## What is left of Family B

- Item 1 is #7139: the annotation column, and three sites.
- Item 2 follows #7139: the cast's tag lookup (the row filed on #7139), then the
  type's-first-name sites.
- Item 3 is the banked spellings. This note adds no work to either.
