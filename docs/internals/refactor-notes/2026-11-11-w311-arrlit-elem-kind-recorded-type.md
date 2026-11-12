# Step 7: a list literal's element kind is its recorded type's, 2026-11-11

`arrLitElemKind` (`emit_value_sites.vl`) now answers `refListElemKindOfTy` of the literal's
recorded element type, past a `| null`, before the shape reader `arrLitElemKindTpl`. The
switch needed one fix first: `collectA`'s kind-9 branch (`emit_collect.vl`) keyed its row by
`arrLitElemHintTy`, which is -1 for a list of lists. The row was then keyed by the codec's
stale spelling, so the kind-9 answer minted a second row for one canonical type.

## The extra rows

D12921, a list of lists in a generic body: the kind-9 branch was called with the spelling `i32[]`,
key hint `_`, and element type `(i32 | null)[]`. The `(i32 | null)[][]` row already existed;
the spelling minted a second ref-list row, its `i32[]` wrapper and a string row, so the module
went from 6 to 12 types. Keyed by `arrLitMintHintTy`, the key the other branch uses, the
branch finds the existing row. The extra rows were one canonical type under a second key,
not a layout need.

## Measurement

Fixpoint seeds on both sides, master `ec5e51b8` against this tree, whole sweep population:
same 23,912, bytes-only 4, output movers 0, runs → not-runs 0, new compiler traps 0. The 4
bytes-only movers shrink or reorder, and none grows:

| cell | master | this |
| --- | --- | --- |
| `arrays/nested-value-union-element-array.vl` | 913 B, 18 types | 891 B, 15 types |
| `arrays/spread-nested-literal-joined-element.vl` | 2842 B, 23 types | 2789 B, 15 types |
| `structs/struct-inner-nullable-array.vl` | 721 B, 13 types | 682 B, 7 types |
| `closures/written-binding-of-generics-delivered-by-list-of-lists-literal.vl` | 1015 B, 18 types | the same types, reordered |

Capability probes: 223 of 227 on both sides.

## What still reads the shape

An `emitFail` probe on the shape reader's remaining call fires on 27 cells. These are the codec's floor:

| class | cells |
| --- | --- |
| no recorded type | 12 |
| a hole or type parameter element (`T[]`, `_[][]`) | 7 |
| a union-of-lists element, which `refListElemKindOfTy` declines | 5 |
| a nullable list type, now peeled | 3 |

The nullable class is closed by the `| null` peel in this change. The other three classes keep
`arrLitElemKindTpl` until the recorded type answers them.
