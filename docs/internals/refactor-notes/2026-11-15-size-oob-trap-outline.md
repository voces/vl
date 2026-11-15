# A failing list-index guard traps through the shared empty backing, 2026-11-15

Lane P, binary size. Item 3 of the seed-size profile in `2026-11-15-size-push-grow-outline.md`.

## The pattern

Every checked `xs[i]` guards its index with one unsigned compare against `len`. The failing arm
traps with the engine's own bounds trap. For a plain backing it reloads the backing and reads it
at `-1`: `local.get; struct.get; i32.const -1; array.get; drop; unreachable`. For a record
backing it does a one-element copy to `len`. Master's fixpoint holds about 20,700 such arms.

## The change

`emitListIdxTrapOf` (wasmEmit) owns the failing arm of all three guard sites:
`emitListIdxGuard`, its hoisted twin, and the map/filter walk's re-check of a cut-off length. In
a plain build the arm is `global.get $empty; i32.const 0; array.get; unreachable`, a read of
index 0 of the module's one zero-length array of the backing's type
(`synthGlobalIdx(SYNTH_EMPTY_BACKING, back)`, the global empty literals already read). That is
the same out-of-bounds array trap, raised at the access, without reloading the backing and
without the `drop`. `-O` keeps `emitListIdxTrap`, whose trap binaryen shares between checks of
one index (D4782). It is a new `gOptimized` reader, registered in `vl_opt_after_link_test.ts` and
in s5-per-module-artifacts.md.

## Two shapes that did not ship

**A shared `__oob__` helper** (`call $__oob__; unreachable`) was smaller still, but it broke
three contracts:

- **Positions.** A trap's top frame became the helper, which has no source position, so
  `vl addr2line` answered `??`.
- **The `--names` contract.** Keeping the inline trap only in builds that record positions
  fixed that, but a `--names` build must be the plain build plus custom sections.
  `native-fixpoint.sh --pair` refused it in the merge queue.
- **Leaf prologues.** Cranelift compiles a function that makes no call without a stack-limit
  check. A call anywhere, even in a cold arm ending in `ud2`, adds one to every entry: two
  dependent loads, a compare and a branch. The compiler's hottest frames (`nodeAt`, `tyAt`) are
  leaves of exactly that shape. Outlining every arm cost L2 CPU a paired median of +2.0% over
  28 rounds.

**The call without `unreachable` after it** let values stay live across the call, which cost
+3–5% L2 CPU.

The shared-backing read has none of these problems. It is not a call, it sits at the access, and
it is the same bytes whether or not the build records positions.

## Measurements

Base is master `6adb40099`'s fixpoint. The candidate is its own fixpoint (r2 == r3), and
`native-fixpoint.sh --pair` holds: stage 4 == the `--names` build's plain bytes.

| reading | master | candidate |
| --- | ---: | ---: |
| seed | 6,401,304 B | 6,299,277 B (**−1.59%**) |
| L2 fuel | (measuring) | |
| L2 CPU, paired ratio over 16 rounds | | (measuring) |

## Behaviour

A trap at a bad index reports `wasm trap: out of bounds array access` on both seeds.

Plain-build pins re-recorded:

| pin | before | after | why |
| --- | ---: | ---: | --- |
| `MELT_TABLE` `list-wrapper-literal`, `-call` (none) | 2 | 3 | the module's empty backing global is one more allocation site |
| `vl_list_walk_hoist_test` guard count | `(i32.const -1)` | also `(i32.const 0)` after a `global.get` | one guard per index in either form |

`-O`/`-O3` melt counts and every `SHAPE_TABLE` row are unmoved.
