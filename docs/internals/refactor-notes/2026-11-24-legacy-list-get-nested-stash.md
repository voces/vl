# Legacy: a nested staging `.get` takes its own stash (2026-11-24, lane IR-D1)

D17381, express. A fused `xs.get(i) ?? d` (`emitListGetOr`, `emitCoalesceOptListGet`) and a plain
`.get` stage a receiver or index that is not a re-readable place into one per-function stash
local, teed on its first read and read again for the element. A staging `.get` nested in the
first's operands teed its own value into the same local; `listGetStageRestore` restored the
markers but not the local, so the outer read the inner list.

## Mechanism

`listGetStageMark` raises `listGetDepth` when the call stages an operand, and the saved markers
carry the depth back. Depth 1 keeps the eager `listGetIdxSlot` and `listGetRecvSlot`, so a
function with no nested staging `.get` is byte-identical; depth d > 1 takes lazy slots keyed by d
(codes 54 and 55). Each stash tee records the depth's owner, and each re-read checks it: a nested
call that took the same depth fails loudly (`.get` … stash overwritten by a nested `.get`)
instead of reading another list. A control build that pins the depth at 1 trips it on the repro.

## Readings

READINGS

## Legacy tails the IR calls

None new.
