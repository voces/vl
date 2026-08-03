# P9 — inlining in the DEFAULT build: MEASURED, and the item is misfiled

**Status: MEASURED on the case P9 was filed against (`bench/arrays/sort-heap`). The inlining question
turned out to be the small half of what the measurement found.** Three earlier attempts died to
stream-level failures without producing a number; this file now records the numbers rather than the
plan, and the one claim that survived those attempts is **refuted** below.

## The headline, and it is not about inlining

Six builds of the same benchmark — the idiomatic source (`main.vl`) and the hand-inlined twin
(`opt.vl`, `siftDown` spliced into both call sites by hand) — at three optimizer rungs. Interleaved
min-of-15, all six producing byte-identical non-empty stdout:

| source | `vl build` | `-O` | `-O3` |
|---|---:|---:|---:|
| `main.vl` (idiomatic) | 830 ms | **579 ms** | 827 ms |
| `opt.vl` (hand-inlined) | 784 ms | **578 ms** | 839 ms |

Three things fall out, in descending order of importance:

1. **`-O3` IS A 1.43× REGRESSION AGAINST `-O`** (827 vs 579) and is a dead heat with the
   *unoptimized* build (827 vs 830). The shipped release profile — `wasm-opt --closed-world -O3
   --gufa -O3` — is the worst of the three rungs on this benchmark. See the mechanism below; it is
   understood, not mysterious.
2. **At `-O`, hand-inlining buys exactly nothing** (578 vs 579). Binaryen inlines `siftDown` there,
   so an emitter-side inliner would be duplicating work already done at every rung a release build
   would use.
3. **P9's actual premise holds only at the DEFAULT rung, and is worth 5.6%** (830 → 784). Real, and
   the smallest number on this page.

## The mechanism — `-O3` trades a branchless test for an unpredictable BRANCH

`-O` and `-O3` produce almost the same shape: both leave 2 functions with 9 and 16/15 locals. Same
`array.get`/`array.set` counts (10/6), same call count. **Identical structure, 43% apart** — so this
is neither an inlining difference nor a locals-allocation difference. The hot loop condition is:

    while cont && root * 2 + 1 <= last

`-O` emits it branchlessly, computing `root*2+1` once into a local:

    local.get 1 / i32.const 1 / i32.shl / i32.const 1 / i32.add
    local.tee 3          ;; child stashed
    local.get 2 / i32.le_s
    i32.and              ;; <-- branchless combine with `cont`

`-O3` turns that into a control-flow diamond **and rematerializes the arithmetic** rather than
reusing the stashed local:

    if (result i32)
      local.get 1 / i32.const 1 / i32.shl / i32.const 1 / i32.add
      local.get 2 / i32.le_s
    else
      i32.const 0
    end
    ...
    local.get 1 / i32.const 1 / i32.shl / i32.const 1 / i32.add   ;; computed AGAIN
    local.tee 3

Heapsort's sift-down branch is data-dependent and essentially unpredictable, so converting a
branchless `i32.and` into a conditional branch in the hottest loop in the program is close to the
worst available trade — and the rematerialization removes the CSE that `-O` kept.

**This is a heuristic misfire, not a correctness issue**, and it is binaryen's, not the emitter's.
What is ours is the decision to ship `-O3` as *the* release profile on the strength of benchmarks
that never compared it against `-O`.

## What is REFUTED

- **"The inlined function carries 62 locals; the variant with the cleanup pass coalesces to 20."**
  This does not reproduce on `sort-heap` at any rung. Maximum locals anywhere in any of the six
  builds is **20**, and the two rungs that differ 1.43× in speed differ by **one local** (16 vs 15).
  Whatever produced 62 was a different pipeline (a bare `--inlining` invocation, most likely), and
  **locals coalescing is not the discriminator on this case.** The hypothesis it was recorded to
  support — that P9 might really be a locals-allocation item — is not supported here.
- **"`-O3`'s win on `sort-heap` is 8–13%".** That number was the HAND-INLINING A/B (`main.vl` vs
  `opt.vl` at the default rung), quoted forward one hop into the `-O3` column. `-O3`'s real effect
  on this benchmark is **−0.4%**, i.e. nothing. *A second instance of this programme's recurring
  failure: a number that is correct about one thing, requoted about another.*

## What this means for P9 as an item

**Re-file it.** "Inline small leaf functions in the default build" is worth ~5.6% on its own
motivating benchmark, and worth **zero** at `-O` and above. That is not a headline item; it is a
default-rung ergonomics fix, and it should be quoted that way or not scheduled.

The item that displaced it is **the optimizer-rung default itself**: the release profile is slower
than `-O` here, and nothing in the harness could have caught it.

## The harness blind spot that hid this

`bench/run.sh` measures the `vl` (default) column and the `vl-O3` column. **It has never built
`-O`.** Every "`-O3` recovers N×" statement in `perf-landscape.md` is therefore a comparison against
the *unoptimized* build, not against the best available rung — true as stated, and not the question
a release profile needs answered. Adding the `-O` column is the fix, and it is cheap.

## Measurement traps hit while taking these numbers (all cost a run)

- **`vl build -O3` with no `wasm-opt` writes the UNOPTIMIZED module and exits 0**, with only a note
  on stderr and an identical byte size. `wasm-opt` is NOT on PATH in this repo — it is vendored at
  `node_modules/.bin/wasm-opt`. Set `VL_WASM_OPT` and **assert the byte size changed**, or every
  optimized cell silently measures `-O0`. `bench/run.sh` already guards this; ad-hoc measurement does
  not.
- **Four "identical" md5s can all be the md5 of an EMPTY file.** `/usr/bin/time` does not exist in
  this container; the timing loop that used it failed every run, wrote four empty outputs, and the
  equality check passed. Assert non-empty before asserting equal — the playbook's empty-vs-empty diff
  landmine, in a new costume.
- Piping a long-running sweep into `tail` buffers all progress until it exits, which reads exactly
  like a hung job.

## Constraints that still apply to any future inliner

- **Do not chase a count into an allocation regression.** This compiler is WasmGC-allocation-bound
  and its own self-compile is in the gate; report the compiler's byte delta and self-compile time,
  not only benchmark wins.
- **The loop-shape gate counts loops MODULE-WIDE** (`tests/selfhost_native_release_test.ts`) and will
  fire on inlining. Get per-function counts before touching a golden — see `perf-landscape.md`.
- Correctness grid an inliner needs: unused result, trapping callee, closures in and out, early
  `return` inside a branch, indirect recursion (A→B→A), and function-value `==` identity (VL closures
  carry an identity, moved to a `call_indirect` index by #1326).
