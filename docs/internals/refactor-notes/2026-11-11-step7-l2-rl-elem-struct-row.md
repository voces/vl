# Step 7 L2 §7: a ref-list element's struct row asks the type before the name, 2026-11-11

`rlElemStructRow(slot)` maps a ref-list row's element to its struct-table row. Its key was half
spelling. A name lookup (`structIndexByName` of the stored element name) both gated the variant
floor and decided the second rung, ahead of the type rungs. w319's close-out (#7253) names this key
as one of the two things the struct class waits on. Base is master `9d279bf7`. Counts are
**programs** over the sweep's 23,885.

## Measured

The probes were `emitFail` markers, one compiler each, built into scratch.

| rung | reached | the type's answer |
| --- | --- | --- |
| name row decides, after the arena rung misses | the type agreed everywhere but 7 | 6 with no type row (`{fs: ((i32) => i32)[], x: i32}`, D15552's records holding closure lists); 1 a twin (`Box<B[]>` named, `Box<A[]>` found, `generics/callback-pin-nested-record-list.vl`) |
| variant floor (the name is a union arm, not a plain struct) | 1,715 | a struct twin of the arm's shape (`Circle` → `{r:i32}`, or another arm `Dot`), or none |

## Changed

The rungs are now: arena identity (`sTyIx`), the canon-key row off the recorded type, the row the
recorded type is stored at, and last the name's row. The name answers only where the type finds no
row: the 6 records holding closure lists. The twin case keeps its byte-identical wasm, since the two
rows share one heap.

## What stays spelled, and why

The variant floor stays keyed on the name. A union arm and a plain record of the same shape are one
type, so the type cannot say "this is the arm": in all 1,715 programs the type answers a struct
twin, or nothing. That is declaration identity, Family B's (w324), and it closes with w314's field
column. `rlElemVariantRow` is the floor's other side and is nominal for the same reason.

## Proof

- Refresh ×2 is a fixpoint at 6,618,303 bytes. The base is master `9d279bf7`'s fixpoint.
- `sweep.vl diff` from base to head: **23,913 same**, 0 bytes-only movers, 0 output movers, 0
  `runs → not-runs`, 0 new compiler traps.
- These pass: lint-self (with the comment, ladder, sentinel and scan budgets), dead-export,
  render-parse, kind-ladder sets, seed-size, late-demands, rep-fuzz (exact), `cases_wasm`,
  `vl_check_codegen` and `vl_scaling_shape`.
