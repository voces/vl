# IR: the partial range loop and the wrap exit (2026-11-21, lane IR-D1)

Coordinator ruling, 2026-11-21: option (b), one dedicated node on the `SForIn` precedent, for
the partial arm and for the rolled arm's wrap exit.

## Why a node

`emitRangePartial` allocates its two scratch locals mid-emit: `lim` for a non-constant bound,
and `u`, the trip base. Each comes from `strI32Slot()`, at `listIdxScratchBase +
liKinds.length`, an index that only legacy's emit order fixes. So the builder cannot name the
slots, and an `IrVar` with a slot bound late would weaken the verifier's and `irSlotRunAgrees`'
invariant. `SRangeLoop`'s lowering drives legacy's own helpers, split out byte-identically
(`--names` A/B identical 9037), around the IR's bodies:
- `rangePartialOuterOpen` / `Close`;
- `rangePartialMainOpen`, which takes `lim` and `u` in legacy's order;
- `rangePartialCopyOpen` / `Close`, which push legacy's `urSlot`/`urVal`/`urBase`;
- `rangePartialMainClose`;
- `emitRangeRolledHead` / `Tail`, which writes the wrap exit (`emitRangeWrapExit`).

Frames map through `loopFrames`, `walkFrames` generalized.

## The bodies

Each copy, and the rolled loop's body, is an ordinary IR body built afresh. A read of the loop
var stays an `OVar` of its known slot. While a copy is lowered, `irLOpnd` asks legacy's own
`urLocalRead` (split out of `emitIdentLocalRead`), which writes `u + k` as legacy does. The copy
count is legacy's plan, `rangePartialCopies` (4, or 0 when a constant bound too low to subtract
from runs no main trip): the builder builds that many, and the lowering refuses any other count.
The verifier checks each copy's label and verifies each body.

## Measured vs the unrolled branch's head 040a7635 (fixpoint seeds on both sides)

| population | functions | start bodies |
| --- | --- | --- |
| self-compile | 19,285 → 19,300 | 138 → 138 |
| distilled | 43,805 → 43,805 | 7,940 → 7,940 |
| tests/cases | 59,221 → 59,237 | 4,263 → 4,266 |
| capability probes | 481 → 481 | 138 → 138 |
| filed witnesses | 17,041 → 17,049 | 3,181 → 3,184 |

The witnesses gain one program, D17041's (filed in this branch). First misses:
- `for range partial`: 52 → 0;
- `for range wrap exit`: 5 → 0;
- `for range hoisted`: 17 → 43 (loops whose next miss the partial arm was hiding);
- `claim fell back`: 3 → 3.
