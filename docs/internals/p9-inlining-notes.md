# P9 — inlining in the DEFAULT build: what is known before anyone builds it

**Status: NOT STARTED. This file exists so the one measurement that survived a failed slice is not
lost.** Three attempts at P9 died to stream-level failures; each left an empty worktree. What follows
is the finding that reached me in the last of them, plus the questions it changes.

## The mechanism finding — `-O3`'s inlining win is NOT inlining alone

Measured while comparing binaryen pipeline variants on `sort-heap`:

> The inlined function carries **62 locals**; the variant with the cleanup pass coalesces to **20**.

**Binaryen's inliner is naive about locals, and the cleanup pass is what pays.** It splices the
callee's frame in wholesale and a later pass coalesces the resulting live ranges. So the observed
`-O3` win on the P9 family (`struct-field` 2.90×, `map-filter-reduce` 1.80×, `sort-heap` 8–13%) is
the product of two passes, not one.

**Why that matters for the item as filed.** P9 is written as "inline small leaf functions in the
default build". If the emitter inlined the same functions but allocated locals *tightly* — which it
can, because it is generating the code rather than rewriting it — it would skip the 62-local
intermediate entirely and might capture the win without needing a coalescing pass at all. That is a
materially different and cheaper proposition than reimplementing binaryen's inliner.

It also raises the opposite possibility, which must be tested rather than assumed: if the win is
mostly the *coalescing* rather than the inlining, then the emitter's own locals allocation is the
real target and P9 is misfiled.

## The next step, and it is a measurement not an implementation

Hand-inline a hot callee in VL **source** (`sort-heap` with `siftDown` inlined by hand is the case
the failed slice had reached), build it with the **default** emitter, and compare against:

1. the same source un-inlined, default build — the baseline;
2. the un-inlined source at `-O3` — what binaryen achieves;
3. the hand-inlined source at `-O3` — whether binaryen still adds anything once inlining is done.

If (1 → hand-inlined default) captures most of (1 → 2), the emitter can win it cheaply. If it does
not, the residue is the coalescing and P9 should be re-filed as a locals-allocation item.

Also count locals in each: the 62-vs-20 figure is the discriminator, and it is cheap to read out of
`wasm-dis`.

## Constraints that still apply

- **Compose vs overlap.** #1326's closure-dispatch win vanished at `-O3` because binaryen was already
  devirtualizing. If P9 only duplicates what `-O3` does, its value is the DEFAULT rung alone — real,
  but it must be stated that way rather than as a headline multiple.
- **Do not chase a count into an allocation regression.** This compiler is WasmGC-allocation-bound and
  its own self-compile is in the gate; report the compiler's byte delta and self-compile time, not
  only benchmark wins.
- **The loop-shape gate counts loops MODULE-WIDE** (`tests/selfhost_native_release_test.ts`) and will
  fire on inlining. Get per-function counts before touching a golden — see `perf-landscape.md`.
- Correctness grid an inliner needs: unused result, trapping callee, closures in and out, early
  `return` inside a branch, indirect recursion (A→B→A), and function-value `==` identity (VL closures
  carry an identity, moved to a `call_indirect` index by #1326).
