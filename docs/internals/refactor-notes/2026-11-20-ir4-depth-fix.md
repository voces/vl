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

`body` is the single walk again, now `body(b, tail, out, keepTop): i32[]`. It returns its top
frame's stack temps, which it requires consumed unless `keepTop` is set. `fragmentBody` is the one
caller that passes `true`, and reads the temps back for the fragment's value. A parameter costs no
frame, and the threshold is the same as before #9241.

**Guard** (`tests/vl_deep_nesting_test.ts`, linux): the labelled-loop case re-runs in a child
`deno` under a 940 KB stack, about 5% below V8's default. #9241's seed fails it, and this branch
passes it. The test's 600 levels is unchanged.

## Measured

Fixpoint seeds: master c4999b0b8 against this branch.

| bar | result |
|---|---|
| `ir-identity.sh --names` | identical 9,037, differ 0; self-compile identical |
| `--cases` | identical 7,516, differ 0; witnesses same 59, differ 0 |
| mode 3 | identical; 18,358 claimed |
| L2 fuel | -0.013% on master (103,301,485,947 vs 103,314,818,009) |
| `gate.sh --fast` | passed |
