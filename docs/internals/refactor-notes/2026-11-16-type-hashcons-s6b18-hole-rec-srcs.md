# Type hash-cons stage 6b: `holeRecSrcsOf`'s 16-step budget becomes a path (lane HASH), 2026-11-16

D16826 (loud emit reject) is a maker's nested record holding an un-annotated function, read
through its fields without a binding: `mk2(inc0).r.f(3)`. The record solve finds the records a
field call's receiver holds with `holeRecSrcsOf` (`check_calls.vl`). It rooted a field read only
at a binding (`cwSlotPath`), so a read of a call's result had no source. The close steps from such
a read into its object, with the field prepended to the path.

That reached depths 2 to 6 of the genrec grid read inline. Depths 8 and 10 still failed, at the walk's
`depth > 16` budget: each level spends a member step and a literal-field step.

## The walk

`holeRecSrcsOf` now carries `seen`, the (node, path length) pairs on its own walk, copied on
extend. A return to a node with a path no shorter than at the earlier visit is a cycle and keeps
the old exhausted answer, `false` (no source). A return with a shorter path is nearer the records,
and the path length bounds those. A same-length test alone would not terminate: a recursive maker
that returns a field of its own call grows the path on every round.

## Grading (fixpoint seeds)

- Genrec depths 2 to 10 read inline run.
- A recursive maker returning its own call terminates, at the same reject as master.
- Deep grid 240/240 and fan-out 40/40, no movers.
- `regress.vl`: 0 `runs → not-runs`.

## Caps seen on the way, not converted here

- `recLeafLitOf`'s `hops < 16` (`check_fit_rules.vl`).
- `recAdBlameInto`'s depth 6 (`check_pins.vl`).
- `cwSlotPath`'s `rev.length < 16` (`check_write_scan.vl`).
- `monoArgSrcOf`'s `guard < 16` (`emit_mono.vl`).
- `recAdPushSettled`'s `REC_STORE_DEPTH` peel (`check_rec_rows.vl`).
- `ftScan`'s `wi < 64` written-literal walk (`check_fn_tag.vl`).
