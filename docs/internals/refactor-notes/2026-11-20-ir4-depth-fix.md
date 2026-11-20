# IR lowering: body is one frame per level again (2026-11-20, lane IR4)

#9241 turned master red at `tests/vl_deep_nesting_test.ts` ("deep nesting (V8): 600 levels,
labelled while loop", `RangeError: Maximum call stack size exceeded`, push run 44699682952).

## Cause

#9241 split `body` into `body` plus `bodyOnto(b, tail, out, p0)` so that `fragmentBody` could keep
its top frame's stack temps for the fragment's value. Every nested body walk then paid a second
frame per level. The trace's 3-function cycle is `body` → `bodyOnto` → `node`: a `--names` seed of
a90248667 puts `bodyOnto` at 0x50e892, the offset in CI's trace.

Fixpoint seeds, `deno test --v8-flags=--stack-size=N`, the labelled-while case (KB):

| seed | passes at | fails at |
|---|---:|---:|
| 6c4d0b027 (before #9241) | 900 | 875 |
| a90248667 (#9241) | 1,100 | 1,050, and V8's default 984 |
| this branch | 900 | 875 |

## Fix

`body` is the single walk again. `fragmentBody` sets a one-shot module flag, `bodyTopKeep`, for
the one `body` call it makes. That call reads the flag and clears it on entry, so a nested walk
never sees it. It skips the consumed check on its own top frame and leaves the temps in
`bodyTopKept` for the fragment's value. The flag is ambient state, chosen so that the recursion
pays no extra frame per level. The test's 600 levels is unchanged.

## Measured

PROOF_TABLE
