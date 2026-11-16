# Type hash-cons stage 6b: `cwSlotPath`'s 16-step limit becomes a visited path (lane HASH), 2026-11-16

`cwSlotPath` (`check_write_scan.vl`) walks a read up to its root binding through elements, fields,
`for` element variables and `.get`/`.slice` receivers. It stopped after 16 steps and answered "no
root" (-1). A function written into a field 16 or more fields down was then invisible to the write
scan. The set the field holds missed the written member, and the call through the chain was the
emit reject "cannot take the generic function `inc0` as a value". Fifteen fields ran.

The walk now records the nodes it passed. A step back to one of them is a cycle and keeps the
exhausted answer, -1. The walk follows one chain, so the list grows with the chain alone.

## Grading (fixpoint seeds, master `7eb37eae4` vs this branch)

- A write through a 16-, 17-, 20- and 24-field chain moves from emit reject to runs (`6`). The
  `for`-element spelling ran at every depth before and still does.
- Deep grid 240/240 and fan-out 40/40, no movers.
- `regress.vl`: 0 `runs → not-runs`, 0 → silent.
- Fixture: `tests/cases/functions/fn-written-through-a-long-field-chain.vl`.
