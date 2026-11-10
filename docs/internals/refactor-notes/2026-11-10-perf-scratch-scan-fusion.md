# The scratch-frame scans, two refused memos, and the unoptimised seed, 2026-11-10

Lane perf-7, after `2026-11-10-perf-self-build-profile.md`. Base is master `3b51c582` (#7055),
whose fetched seed is already a fixpoint (6,600,678 bytes, two `refresh-compiler.sh` runs
byte-identical). Fuel is `$VL_FUEL=1` guest fuel. Peak live is `VL_GC_STATS=1`. This box has no
`/usr/bin/time`, so peak RSS was not read. The L2 profile is 26,033 samples from the `--names`
build of the same source.

## 1. Hotspot 4 is predicates, not walks

`fnDetectScratch` is 5.39% of L2 samples, inclusive. By the walk it calls:

| walk | file | L2 incl | note |
| --- | --- | ---: | --- |
| `fnHasStrOp` + `fnTailWidensAtomToStr` | emit_fn_scans.vl | 1.89% | 0.69 is `callWidensAtomToStr` → `argsHaveAtom` → `exprIsLitAtom` |
| `leqScanBlock` | emit_collect.vl (w267) | 1.41% | |
| `blockHasMapOp` | emit_fn_scans.vl | 0.64% | 0.38 is `exprMap` → `readRepOf` |
| `scanStashes` → `blockStashMisses` | emit_sections.vl, emit_fn_scans.vl | 0.43% | already one walk for three bits |
| `blockPushPopBits` | emit_fn_scans.vl | 0.39% | already one walk for six bits |
| `collectRefSlots` | emit_collect.vl (w267) | 0.25% | |
| `blockHasScratch` ×2 | emit_query.vl | 0.18% | the same walk, asked twice |
| `mfScan` | emit_collect.vl (w267) | 0.15% | |

Under `fnDetectScratch`, `nodeAt` is 0.56% of samples and the walkers' own frames another ~0.7%.
Everything else is the per-node predicates, and those live mostly in emit_classify.vl. Each walk
also stops at its own first hit, at a different node from the others. A walk fused over
emit_fn_scans.vl therefore saves at most the traversal (~0.3–0.5%) and gives up those early exits.
It was not built.

**Taken:** `blockHasScratch` asked `"arrNew"` and `"coalesceCall"` in two walks of the same node
set. All six of its callers ask both. It is now one walk, `exprScratchMisses` / `blockScratchMisses`
/ `fnScratchMisses`, which takes the bits still wanted and stops once none is left, as
`blockStashMisses` already does. Each bit is found exactly where its own walk found it, because the
node set and both leaf tests are unchanged.

| build | fuel before | fuel after | Δ | peak live |
| --- | ---: | ---: | ---: | --- |
| L2 self-compile | 79,631,115,154 | 79,525,953,710 | −0.13% | 974 → 974 MiB |
| plumb main | 9,090,877,501 | 9,061,493,156 | −0.32% | |
| plumb tail | 6,588,645,819 | 6,567,138,555 | −0.33% | |

The seed is a byte-identical fixpoint at 6,600,575 bytes (−103). All 7,690 `tests/cases/**/*.vl`
files build to identical wasm, stderr and exit code under the master seed and this one.

## 2. Two refusals: fuel charges calls, not allocation

* **`repOfTy` memoised per type index** (3.56% inclusive, 3.0 of it through `repOfNodeAt`).
  emit_rep.vl cannot import `tyRegGenNow`: emit_shape_rows.vl imports emit_rep, and the module
  graph refuses the cycle. So `tyRegMemoReset` installed it through a function slot. The output was
  identical, and L2 fuel **rose** to 80,299,252,445 (+0.84%). The stamp makes 21 `memoMoved`
  calls on every lookup, and that costs more than the descriptor build it saves.
* **The child-list walkers moved to `nodeChildrenPush` over a shared stack** (`a20RetWalk`,
  `weBoundWalk`, `weRefsIn`, `weScan`, `weScanFree`, `weScanShapes`, `strAccWalk`). The output was
  identical, and L2 fuel **rose** to 80,161,409,846 (+0.66%). A fixed-size `[a, b]` is one
  allocation instruction, and fuel barely sees it. A push is a call with a bounds test, and the
  matching pop loop is more calls. Avoiding allocation lowers RSS and collection work; it raises
  this lane's metric.

## 3. Not cut, with the reason

* **`a20RetWalk`** (1.41%): five checker callers walk the same callee bodies. `holeSlotCallRets`,
  0.51% of it, walks once per `let` whose init is a call. A memo keyed on the body is unsafe:
  in-place child writes do not bump `arenaEpochNow` (`n.callArgs = supplied` in check_pins.vl,
  `n.callArgs = head` in check_demands.vl, `n.callFn = k` in check_calls.vl). A named-argument
  reorder would also reorder the returns found under the call.
* **`crInfoOf`** (2.46%, from `crFilterCond` on every condition): already memoised per
  (root, binding). The cost is the reacher fixpoint (`crwMentionsAny` 0.72%) and `cwKeyOfDecl`'s
  frame build (0.55%) on first asks.
* **Self time** is `nodeAt` 5.96%, `__map_probe_i32__` 3.85% (mostly elab tables, w266's files),
  `tyAt` 3.38%, `__str_eq__` 2.86%. `nodeAt` and `tyAt` are one-line accessors; their cost is the
  call. That is §4.

## 4. The seed is unoptimised, and `-O` is now worth 12.8% of L2 fuel

`vl build compiler/entry.vl -O` (binaryen 130 from `node_modules`) gives a 6,060,513-byte seed,
against 6,600,678. That seed compiles `compiler/entry.vl` to the **same bytes** the plain seed
does, with **69,414,672,058** guest fuel against 79,631,115,154 (−12.8%). That is below the
70.33G baseline. The workboard row of 2026-08-18 ("the shipped seed is UNOPTIMISED") measured
−3.3% in wall time and filed it as an owner call. Its reason still holds: an optimised seed is
not byte-equal to what `refresh-compiler.sh` builds from source. So either the refresh runs
`wasm-opt` itself (its cost is one `-O` pass over the seed per refresh, on CI and locally), or
the fixpoint is re-stated as equality of what each seed builds. This lane did not change the
pipeline.

## 5. Hotspot 3, the return-inference pre-pass: a design, not built

`inferReturnsPrePass` is 7.67% of L2 inclusive. It runs only over
`inferCycleMembers(topUnannotFns)`, the un-annotated top-level functions on a call cycle,
because the main pass checks callee-first (`progCheckCalleeFirst`) and needs no pre-pass for the
rest. Each cycle member is checked quietly and in full, with diagnostics, symbols and the
redundant-type stream suppressed. Its tentative members are re-checked until the tentative set
stops shrinking. Then `checkRollback` discards all of it except the settled return types, and the
main pass checks the body again. In the compiler, every un-annotated self-recursive function is a
cycle member.

What the pre-pass must produce is one type per function. Two designs:

1. **Keep a clean member's check.** When a member's quiet check settles on its first pass, records
   no diagnostic and reads no tentative return, keep its node types and skip its body in the main
   pass. The main pass still owes it what was suppressed: the symbol rows and the redundant-type
   stream. Those would have to be recorded quietly and replayed, not recomputed. Risk: anything
   the main pass reads from scope state that the quiet pass set differently.
2. **Settle a singleton self-cycle from its base cases.** A function whose only cycle is itself
   types its non-recursive returns first. When every recursive return's type is the call's own
   result, that join is the return type, and no full body check is needed in the pre-pass.
   Anything else falls back to today's path.

The first saves a member's whole second check. The second saves only the pre-pass check of the
commonest case. Before either is built, measure the split: samples under `preInferOne` for
singleton SCCs against larger ones, and how many members settle on the first pass.
