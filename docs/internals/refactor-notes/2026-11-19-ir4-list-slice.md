# IR coverage: a list's `.slice` (2026-11-19, lane IR4)

On master 8b89f4bc3, the `VL_IR_SHADOW=4` blocker census showed `method slice` blocking 17
self-compile functions alone and about 15 more alongside one other miss.

## What changed

Legacy's `emitArrSlice` used to make its decisions, then evaluate the receiver, then write the
clamp and copy. It now runs in four parts:
- **`arrSlicePlanOf`**, a pure plan: the receiver kind, the wrapper and backing heap types, the
  `.map`/`.filter` frame's source and result locals, and the receiver and bound nodes;
- the receiver, then **`sliceRecvTail`**: the non-null recovery and the scalar-view sync;
- the bounds;
- **`arrSliceTail`**: the stores into the frame, the clamp, the new backing and wrapper, and the
  `array.copy`.

The order is the one legacy already wrote (receiver, bounds, then `endL`, `startL` and `srcL`
stores), so the bytes do not move. A ref-list row that does not resolve still refuses through
`refListRowRefused`; the plan names it `row` rather than raising it.

The IR adds **`RListSlice { scV, scArgs, scAt }`** (family `list`). `methodRhs` builds it where
legacy's ladder takes the arm, `callIsArrSlice` and not the string slice. The receiver must be a
list rep and every bound an i32; otherwise the miss is `slice receiver rep` or
`slice bound coercion`. The lowering asks the same plan, writes the receiver, `sliceRecvTail`, the
bounds and `arrSliceTail`. The verifier checks the rules the builder relies on: a list receiver,
i32 bounds, and a destination at the receiver's rep. The lint mirrors gain `RListSlice`, `scV` and
`scArgs`.

## Measured

Fixpoint seeds: master 8b89f4bc3 against this branch on the same base.

| | master | this branch |
|---|---|---|
| self-compile claimed (mode 3) | 14,670 | 14,690 (+20) |
| corpus covered = verified = matched | 35,249 | 35,254 (+5) |

| bar | result |
|---|---|
| `ir-identity.sh --names` | identical 9,037, differ 0; self-compile identical |
| `ir-identity.sh --cases` | identical 7,514, differ 0 |
| `--claims` / mode 3 | ok / identical |
| armed shadow | all matched; ok |
| L2 fuel | 100,820,583,049: +0.07% on master (100,750,891,716). Both are about +1% on the baseline file, and the coordinator refreshes the drift; no baseline is written here |
| pin helpers, `emit_mono.vl` | 905 |
| lint-self, ladder-sets, dead exports, comment budget | clean / ok / 0 / ok |
| phase state, late demands | ok (hidden 154) / 9 of baseline 9, 307 tag rows |
| `deno task test` | 9,574 passed, 0 failed |

**Lines: compiler +240 / −133.** Nothing is deleted. In `wasmEmit.vl` (+167 / −118), the slice body
is regrouped into the plan and two tails, and the plan type is new. The IR side adds about 60 lines
and the lint mirrors re-wrap. This is a coverage step.
