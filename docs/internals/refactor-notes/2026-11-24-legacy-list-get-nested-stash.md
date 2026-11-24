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

Fixpoint seeds both sides; base master `4a0d6ba5` in its own tree.

- Legacy A/B, base seed against head seed over `tests/cases` and the capability probes:
  `4 DIFF, 8094 same`. The four moved are exactly the nested-staging programs,
  `tests/cases/lists/list-get-nested-stash-<i32|f64|string|record>.vl`; their hoisted twins and
  `list-pop-nested-stash-control.vl` are unmoved.
- The depth matrix prints, on master, `6 1` then a trap (i32), a cast trap (f64), `q q p q t q t p`
  (string) and `6 6 5 6 9 6 9 5` (record); with the fix each prints its hoisted twin's output.
- The control: a build pinning the depth at 1 stops V2's repro at the owner check,
  `` `.get` receiver stash overwritten by a nested `.get` ``.
- Identity: names `identical 9433, differ 0`, self-compile identical; cases `identical 8034,
  differ 0`; claimless `identical 14473, differ 0` (claimless compiler sha256 `82cb6611…28e0`,
  built in `232ad610`, `compiler/` clean). The IR misses these arms, so claimed and claimless
  agree.
- Fuel: per PR +0.01%; the pair is L2 127575158579 against base 127574475261.

## Legacy tails the IR calls

None new.
