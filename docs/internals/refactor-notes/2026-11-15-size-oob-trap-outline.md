# A failing list-index guard in a calling body traps through one shared helper, 2026-11-15

Lane P, binary size. Item 3 of the seed-size profile in `2026-11-15-size-push-grow-outline.md`.

## The pattern

Every checked `xs[i]` guards its index with one unsigned compare against `len`, and the failing
arm traps with the engine's own bounds trap: it reloads the backing and reads it at `-1`
(`drop(array.get $B back -1)`, then `unreachable`), or for a record backing does a one-element
copy to `len`. Master `6f020f1a6`'s fixpoint holds 20,705 such arms, about 13 bytes each.

## The change

`emitListIdxTrapOf` (wasmEmit) owns the failing arm for all three guard sites:
`emitListIdxGuard`, its hoisted twin, and the map/filter walk's re-check of a cut-off length. It
writes `call $__oob__; unreachable` when all of these hold:

- **The build is plain.** `-O` keeps the inline trap, so binaryen can still share one trap block
  between checks of one index (D4782). This is a new `gOptimized` reader, registered in
  `vl_opt_after_link_test.ts` and in s5-per-module-artifacts.md.
- **The build records no source positions** (`idxSpanOn`: `--names`, `--source-map`, `vl run`).
  Where positions are recorded, the trap's own frame must be the access. With the helper, the
  top frame was `__oob__`, which has no position, so `vl addr2line` answered `??`; five
  `vl_addr2line_test` cases caught it.
- **The body has already written a call** (`gFbCalls`, counted by emit_bytes' four call writers
  and reset per function body). A leaf keeps the inline trap.

`__oob__` is one tail helper per module (`HELP_OOB_TRAP`), minted on first ask. Its body reads
index 0 of an empty array of the first backing that asked, which raises the same array-bounds
trap.

## Why a leaf keeps the inline trap

Cranelift compiles a function that makes no call without a stack-limit check. A call anywhere in
the body, even in a cold arm that ends in `ud2`, adds one to the prologue: two dependent loads
from the vmctx, a compare and a branch, paid on every call. Here is the disassembly of
`function at(xs: i32[], i: i32): i32 { xs[i] }`:

```
master:            push %rbp; mov %rsp,%rbp; test %edx,%edx; ...
outlined:          push %rbp; mov %rsp,%rbp; mov 0x8(%rdi),%r10; mov 0x18(%r10),%r10;
                   add $0x10,%r10; cmp %rsp,%r10; ja <trap>; test %edx,%edx; ...
```

The compiler's hottest frames are leaf accessors of exactly this shape (`nodeAt`, `tyAt`).
Outlining every arm cost L2 CPU a paired median of +2.0% over 28 rounds (95% interval
0.999–1.050). Counting calls makes the leaf byte-identical to master and leaves 4,013 arms
inline. Those are the leaves, plus guards that come before a body's first call.

## The `unreachable` after the call is load-bearing

The first cut ended the arm at the call. Fuel fell 0.19%, but L2 CPU rose 3–5%: with nothing
ending the arm, the call returns into the hot path, so every value live in the function stays
live across it and is spilled around it. Closing the arm with `unreachable` costs one byte a
site.

## Measurements

Base is master `6f020f1a6`'s fixpoint. The candidate is its own fixpoint (r2 == r3).

| reading | master | candidate |
| --- | ---: | ---: |
| seed | 6,388,478 B | 6,233,979 B (**−2.42%**) |
| L2 fuel | 87,490,264,809 | 87,363,113,561 (−0.15%) |
| L2 CPU, interleaved median of 16 | 36.81 s | 36.58 s |
| L2 CPU, paired ratio over 16 rounds | | median 0.988, 95% interval 0.958–1.040, 7 of 16 above 1 |
| L2 peak RSS | 4,153 MB | 4,149 MB |
| plumb fuel main / tail (`-O`, trap inline) | 9,108,706,089 / 6,598,313,248 | unchanged |

For comparison, outlining every arm (the variant that did not ship) took the seed to
6,197,850 B (−2.98%).

## Behaviour

The sweep records with positions on, so a recording of the shipped rule shows only the position
rule: 0 movers of 24,989. A sweep of the variant that outlined every arm, recorded before the
position rule, exercised the helper in every program. Against master it showed 16,838 same,
8,147 bytes-only movers, 0 runs lost and 0 new compiler traps. There were 4 output movers, each
an existing validation failure (D16281, D16421, D16422 and `dord030`) whose message changed only
in the byte offset. `regress.vl`: no runs lost.

Plain-build pins re-recorded:

| pin | before | after | why |
| --- | ---: | ---: | --- |
| `MELT_TABLE` `list-wrapper-call` (none) | 2 | 3 | `__oob__`'s empty array is one more allocation site |
| `MELT_TABLE` `list-wrapper-push` (none) | 3 | 4 | same |
| `MELT_TABLE` `list-wrapper-push-reserved` (none) | 4 | 5 | same |
| `vl_deep_is_walker_test`, multi-value twin count | `__grow_` excluded | `__grow_` and `__oob__` excluded | a shared helper is not a walker, and not a twin |
| `vl_list_walk_hoist_test` guard count | `(i32.const -1)` | also a call closed by `unreachable` | one guard per index in either form |

`list-wrapper-literal` stays at 2, because its guard comes before any call. The `-O`/`-O3` melt
counts and every `SHAPE_TABLE` row are unmoved.
