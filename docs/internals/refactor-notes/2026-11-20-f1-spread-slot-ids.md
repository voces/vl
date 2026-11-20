# Spread literal slot keys (2026-11-20)

Array-spread PR 1 of 3, the legacy half: the IR's spread lowering (PR 2, one group; PR 3,
many) must reach the same frame slots legacy does, so those slots must be a pure function of
the literal node, not of how many scratch slots the frame had minted when it was emitted.

## Mechanism

- `scanArrLitCommit`'s walk records, for every array literal with a spread item, a slot
  ordinal and a first group ordinal, program-wide in source order; groups are counted as
  `emitArrSpread` forms them (a spread item, or a run of plain elements).
- `spreadSlotIdOf` / `spreadGroupSlotIdOf` read them, following `nodeSrc` to a clone's origin.
- Codes 48 (group wrapper), 49 (destination backing) and 50 (the join's two `i32`s) key by the
  ordinals; the frame layout types them as codes 20, 21 and 10. A literal no walk met keeps the
  sequence keys on codes 20, 21 and `widenTmpSlot(2000 + 2·seq)` unchanged.
- An ordinal past the key's room (`4096·ordinal` must fit an `i32`) is an internal emitFail.

## Why program-wide ordinals

Per-function ordinals would give a monomorphized clone its origin's numbers, and two origins'
literals can land in one frame when one nests in the other's group. Program-wide numbers make
two distinct recorded literals never share a key in any frame.

## Lifetime

A literal's slots are written before they are read and are last read at its own join. A
literal never contains its own node, so a nested spread is a different ordinal; a literal
emitted twice in one frame rewrites every slot before it reads one.

## Readings

Against a master fixpoint at a90248667 (candidate a fixpoint, 6,887,609 bytes):

- IR coverage: unchanged by construction (a legacy-only change); shadow 40,127 covered, verified
  and matched.
- Corpus `ir-identity --names` against master: 9,037 identical, 0 differ.
- `tests/cases` `--names` A/B: 7,236 same, 2 differ, 1,394 fail under both. The two: the new
  witness `arrays/spread-slots-per-literal.vl`, and `lists/spread-operand-walked.vl`, whose one
  difference is `[0, ...[9, ...b]]`: master's outer group 1 took the inner literal's sequence
  key `seq + 1` and so reused its group-0 slot, dead after the inner join; the candidate gives it
  its own (one extra local).
- L2 self-compile fuel 103,295,490,306 to 103,303,641,275 (+0.008%).
- Compiler: 112 net lines.
