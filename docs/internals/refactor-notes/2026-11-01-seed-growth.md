# Where the seed's growth went, 0becd8120 → 9d1d7374

Moved verbatim from [architecture-target-2026-10.md](../architecture-target-2026-10.md) §4.1d on 2026-11-07; its `§` references are to that file.

### 4.1d Where the seed's growth went, 0becd8120 → 9d1d7374 (2026-11-01)

#5735 rewrote the seed-size baseline after +177 KB of growth since the #5235 reading, which was taken
at 0becd8120. This section prices that growth by function. It is a one-off measurement, not a gate.

Method. Each tree was built to its own fixpoint, then once more with `--names`. Function bodies were
summed from the code section, keyed by function name. Names are compared without their module hash and
line, so a function that moved files is not counted as added and removed.

| | 0becd8120 | 9d1d7374 | change |
|---|---|---|---|
| seed bytes (fixpoint) | 5,901,246 | 6,078,235 | +176,989 |
| code-section bytes | 5,461,169 | 5,630,768 | **+169,599** |
| distinct function names | 14,886 | 15,384 | +498 |

The code-section change splits as follows:

| | bytes |
|---|---|
| names that are new | +503,263 (1,557 functions) |
| names that are gone | −267,772 (1,060) |
| names in both, grew | +83,599 |
| names in both, shrank | −149,491 |

**Where it came from: the new producers.** The elaboration, the tag decision and the mint
(`emit_elab.vl`, `check_elab_cap.vl`, `check_fn_tag.vl`, `check_mint.vl`) went from 38,699 to
215,196 bytes, **+176,497**. That is more than the whole net growth.

- **The largest new or grown functions:** `elabRun` (+4,647), `readRepGo` (4,548), `rowMintFrom`
  (3,527), `elabOne` (+3,335), `elabCanonStr` (3,095), `elabSetArgBind` (2,525), `fnTagDecide` (2,461),
  `ftPlan` (2,188) and `elabSetCallRows` (2,187).
- **By file, bytes in names that are new:** emit_elab.vl 85,682, emit_classify.vl 42,535 (the read-rep
  layer, against 60,063 gone from that file), check_fn_tag.vl 39,210, check_elab_cap.vl 35,827 and
  check_fit_rules.vl 31,975.

**What was deleted.** The largest falls by file were emit_classify.vl (−48,750), wasmEmit.vl (−15,499),
emit_collect.vl (−12,176), emit_ty_canon.vl (−12,006), emit_ref_list_kinds.vl (−11,297),
emit_narrow_slots.vl (−11,275, gone) and emit_sig_tokens.vl (−10,940). These are step 5 and step 6's
classifier and narrowing deletions. Named families §3 marks for deletion, now at or near zero:

| family | 0becd8120 | 9d1d7374 |
|---|---|---|
| `pushNarrow*` | 3,314 | 290 |
| `pinHoleLambdaArg` | 1,532 | 0 |
| `expCtx*` | 1,309 | 0 |
| `nodeTyInDerived`'s rungs | 1,193 | 188 |
| `letRefListDestSlot*` | 694 | 0 |

**What was meant to go and is still here.** The step 2 to step 4 deletions have not started in bytes:

| family | 0becd8120 | 9d1d7374 | change |
|---|---|---|---|
| fn_split.vl | 165,849 | 167,688 | +1,839 |
| fn_flow_shadow.vl | 75,676 | 75,125 | −551 |
| emit_mono.vl's `mono*Pin*` functions | 116,212 | 113,000 | −3,212 |
| `genFnHole*` | 10,173 | 10,126 | −47 |

Those families still hold 366 KB. Mono's rung B (#5723) accounts for 992 bytes of the `mono*Pin*` fall,
counting the rung and the two helpers only it called. Its neighbour `monoPinAnnotatedParam` grew by
1,238, to 5,086.

So the refactor has paid for the new producers (+176 KB) almost entirely in seed bytes. The deletions
those producers exist to enable are still to come. §4.2's step 4 "↓↓" on seed is the line that has to
move. Retiring the split plan (increment 3) deletes fn_split.vl and fn_flow_shadow.vl (243 KB). The
pin ladder's deletion (step 2) is the other 113 KB.
