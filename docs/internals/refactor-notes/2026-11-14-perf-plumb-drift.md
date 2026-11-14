# The plumb-shape fuel drift since #7060, and four emit queries that answer first, 2026-11-14

Lane P. The plumb-shape baseline is #7060's (`bcf337c7`, main 8,975,636,030 / tail
6,567,138,555). Master `c522f8dd` read main 9,408,300,509 (+4.82%) and tail 6,810,755,090
(+3.71%), near the +5% bar. Fuel is `$VL_FUEL=1` guest fuel of `vl build --names -O
--import-memory` of each unit, with `wasm-opt` stubbed. It agrees with `plumb-shape-cost.vl --check`
to within 600 units. Every seed is the commit's own fixpoint: the previous sample's fixpoint builds
the commit's `compiler/`, and that build builds it again.

## Where it came from

Sixteen fixpoints, one every 52 compiler-touching first-parent merges, then each interval that
moved bisected to one merge (steps of at least 0.12% on main):

| merge | main | tail | what it added |
| --- | ---: | ---: | --- |
| #7944 (D16006) | +1.35% | | `exprReadsDeadNever` walks the expression with `nodeTyAt` at the top of every `emitExpr` |
| #7258 (D15718) | +2.78% | | `recBuiltStoresRefuse` built the write index for every program; master has since gated it (−3.2% within `f46fc242..8ead8f23`) |
| #7240 | −0.99% | | VKind descriptor reads, a saving |
| #7436 (D15749) | +0.76% | | `emitTypedHolderInit` asks `elabKeyOfFn` and a `nodeSrc` probe at every `let` |
| #7419 (D15700) | +0.66% | | `inlineConstRecArgs` walks the whole tree with `nodeChildren` |
| #7598 | +0.43% | | `emitIdentNode` asks `readNarrowedTyAt` at every name read |
| #7209 | +0.40% | | `nodeTyIxOf` became `nodeTyAt` at four readers |
| #7421 (D15744) | +0.27% | | the callee-through-`const` reads (master has since reworked them) |
| #7989 (D16019) | +0.21% | | |
| #7899 (D2171) | +0.16% | | `spillValueWrites`, a statement walk per function |
| #7628 | +0.13% | | |

Tail steps track main within 0.1 point.

## What this changes

Each change is exact: the skipped work produced nothing, or the reordered reads are pure.

| change | main fuel | Δ | tail Δ | profile frame |
| --- | ---: | ---: | ---: | --- |
| master `cd539611` | 9,390,082,585 | | | |
| `emitTypedHolderInit` answers 1 while no binding took a holder's member (`elabHasTypedReads`) | 9,337,259,512 | −0.56% | −0.51% | #7436's step |
| `inlineConstRecArgs` returns when the arena holds no statement `icraInline` takes; both read one head predicate, `icraHead` | 9,293,730,516 | −0.47% | −0.45% | #7419's step |
| `emitPhaseReached` compares a rank `emitPhaseSet` keeps, not two literal matches | 9,254,010,529 | −0.43% | −0.42% | `emitPhaseReached` 0.73% self (plumb) |
| `scopeTyAt` reads `nodeTyIxOf` once, not again through `elabCheckedTyOf` | 9,196,362,563 | −0.62% | −0.61% | `scopeTyAt` 2.57% incl (plumb) |

On `c522f8dd`, fixpoint against fixpoint: main 9,408,300,509 → 9,220,761,480 (−1.99%), tail
6,810,755,090 → 6,680,407,150 (−1.91%). The L2 self-compile reads 83,171,492,970 → 82,578,386,871
(−0.71%). Sweep, `c522f8dd` against the candidate: 24,584 same, 0 bytes-only movers, 0 output movers.

A first cut of the `inlineConstRecArgs` pre-check looked only for a record literal. Master's
`icraInline` also takes a `const` choice (D15773), so four programs went `runs → emit_reject`. The
sweep caught them, and that is why the pre-check now calls `icraInline`'s own head.

## Time, memory and size

Same pair (`c522f8dd` against the candidate, both fixpoints). CPU is user+sys, median of 10 warm
runs over two interleaved rounds, on a 4-core VM where one build varies ±10% run to run. Peak RSS
is `getrusage` of the build, and peak live is `VL_GC_STATS=1`. Plumb runs with `-O`, `wasm-opt`
stubbed and `VL_COMPILE_GC_GROW=off`.

| unit | fuel | CPU | peak RSS | peak live |
| --- | ---: | ---: | ---: | ---: |
| plumb main | −1.99% | 3.24 → 2.90 s | 311.8 → 311.8 MB | 117.4 → 117.4 MiB |
| plumb tail | −1.91% | 1.80 → 1.61 s | 311.7 → 311.7 MB | 82.2 → 79.5 MiB |
| L2 self-compile | −0.71% | 24.9 → 24.1 s | 4,150 → 4,124 MB | 950.9 → 951.0 MiB |

The CPU deltas run the fuel's way, but they are no larger than this box's noise. The seed grows
6,801,817 → 6,802,106 bytes (+289, +0.004%).

## The baselines

Neither fuel ratchet is rewritten. Main still reads +2.7% and tail +1.7% against #7060's baseline,
and a write here would raise the line. This box has no `/usr/bin/time` and is not the baseline's
CPU, so it could not write the RSS and CPU halves either. The rest is the rows above. Of that,
#7944's walk is still 1.13% of main (ablated on this branch), and its exact fix is the open item.
`never` is legal only as a declared return type, so a read is checked `never` only under D16006's
narrowing or in an instance at `never`. D16260 and D16261 refuse the instance today.

## Profiling note

`VL_PROFILE_GUEST` on a `-O` build records only the in-guest optimizer's store (25 samples on the
main unit), so profile a plumb unit without `-O`.
