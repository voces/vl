# Type hash-cons stage 6b, tier 2: emit_shape_rows.vl's walk limits (lane HASH), 2026-11-17

`emit_shape_rows.vl` goes 7 → 0. That covers the census-reached `nestedNulRefElemNominalAt`
(row 523), `tyMentionsLitOrObj` (row 525) and `tyMentionsFunc` (row 522), and the file's other
four sites.

| function | was | now |
| --- | --- | --- |
| `tyReachesItself` | visited sets plus a 64-type cap that answered "recursive" | the visited sets alone |
| `fnTagListRepTy`, `fnTagListRepName` | `depth < 16` down list elements | types seen |
| `tyMentionsFunc` | `depth > 12` | types seen |
| `nestedNulRefElemNominalAt` | `depth > 8` | list types seen; a revisit declines, as the bound did |
| `fnSigNamesLit` | `depth` 8, past which it answered "names a literal" | types seen |
| `tyMentionsLitOrObj` | `depth > 6` | types seen; the depth argument goes from its two callers |

Two caps answered the declining side: "recursive" in `tyReachesItself`, "names a literal" in
`fnSigNamesLit`. A type larger or deeper than the cap is now answered exactly.

## Grading (fixpoint seeds, master `31142acae` vs this branch)

- Identity sweep: all 3,223 programs byte-identical.
- `regress.vl`: 0 `runs → not-runs`, 0 → silent, no cell changed class.
- Deep-nesting grid: 240 of 240 run.
- `tests/vl_scaling_shape_test.ts`: passes.
- Self-compile fuel: 94,178.6M against master's 94,176.4M.
- `walk-limit` baseline: 512.
