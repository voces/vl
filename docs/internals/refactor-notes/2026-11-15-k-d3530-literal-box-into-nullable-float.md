# D3530: a two-width literal union into a nullable float, 2026-11-15

Lane K, bucket (f), clause 2.

## Mechanism

`type D = 9000000000 | 1`, delivered into `f64 | null`.

- `litNumUnionConverts` (D3523) admits a literal box into a numeric primitive only, so the
  nullable destination was refused.
- That destination lowers as a box too, so the delivery is a box-to-box retag.
- The retag table (`widenTargetOf`) widens `i32` and `f32` but has no `i64` to `f64` row. For a
  variable that conversion is lossy.
- Lane LC's earlier draft admitted the delivery without the row and printed `null`.

## Change

- `check_assignable.vl`: a union `litNumUnionConverts` accepts at the non-null member of a
  nullable destination is accepted, and its retag rows are recorded there
  (`recordWidenRetagTails`).
- `check_ty_relate.vl`:
  - `widenMemberPairs` asks `litI64HeldTargetOf` when an `i64` member has no lossless target;
  - that gives `f64`, else `f32`, only when every `i64`-based leaf of the box is an integer
    literal that float holds (`intLexHeldBy`);
  - a variable `i64` member gets no row.
- `wasmEmit.vl`: `widenConvOpOfKinds` converts `i64` to `f64` and `f32`. It is reached only from
  those rows.

Net compiler lines: +44 (+46/−2). Pin helpers: none touched.

## Grading

On a fixpoint seed:

| spelling | result |
| --- | --- |
| the witness | `1` |
| `9000000000` into `f64 \| null` | `9000000000`; `+ 0.5` gives `9000000000.5` |
| `16777216` into `f32 \| null` | `16777216` |
| `9000000000` into `f32 \| null` | refused: `f32` does not hold it |
| `9007199254740993 \| 1` into `f64 \| null` | refused |

A map read into `Map<string, f64>` prints `9000000000`. Every `litunion*` and `mixed-width*`
matrix ran against master's fixpoint seed. The other gates: see the PR.
