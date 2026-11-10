# The compiler's own cost: L2 self-build and plumb-shape profile, 2026-11-10

Base is master `3adeace6` (#7041), fixpoint seed 6,598,874 bytes (two `refresh-compiler.sh` runs
byte-identical). Fuel is `$VL_FUEL=1` guest fuel, a count that box load cannot move. CPU seconds
were not used: the box is a shared cloud VM. Peak RSS is GNU `time`'s `%M` of the `vl` process.

## 1. The three readings

| build | guest fuel | peak RSS | peak live (copying) |
| --- | ---: | ---: | ---: |
| L2: the candidate compiling `compiler/entry.vl` (`self-compile-time.sh`) | 92,200,911,821 | 4,268 MB | 956 MiB |
| plumb main unit (`plumb-shape-cost.vl`, `--names -O --import-memory`) | 9,082,698,283 | 320 MB | 117 MiB |
| plumb tail unit (`--shape tail`) | 6,583,221,426 | 318 MB | 83 MiB |

The baselines read 70.33G (L2, `483c1b024`, +31.1%, trip at 1.5×), 8.976G main (+1.2%) and
6.580G tail (+0.1%). Peak live is `VL_GC_STATS=1`; the plumb units' is under a 32 MiB first heap,
so it approaches the true peak.

**RSS is heap-sized, not live-sized.** The L2 build runs copying from a 2 GiB first heap
(`self-compile-gc.sh`) and grows it once: 4.1 GB resident growth for a 956 MiB live set. The
plumb units sit on the 256 MiB first heap (320 MB RSS for a 117 MiB live set). A smaller live set
moves neither RSS until it crosses a heap-size step, so this lane grades fuel first.

## 2. Two instrument facts

* **A `-O` build's guest profile holds only the post-`wasm-opt` scan.** `VL_PROFILE_GUEST` on
  `vl build --names -O` wrote 46 samples, all in `wasm_read.vl` / `opt_scan.vl`: the compile's own
  samples are lost. Profile without `-O`; the guest fuel differs by 0.01% (9.0816G against
  9.0827G on the main unit).
* **`--names` without `-O` costs 8.6% more fuel than with it** (9.866G against 9.082G on the main
  unit), and it is all `emitSrcSection`: `-O` drops the `vl-src` section, so the gated reading
  never pays it. The plumb profiles below were taken with `--names` and no `-O`, so their
  `vl-src` row is real for a debug build and absent from the gate.
* `profile-phases.vl`'s phase list predates `checkProgramPass` and `checkProgramResumed`, and
  charges 46–55% of every run here to "outside every named phase". The phase table below uses a
  current list (most specific phase on the stack wins).

## 3. Fuel by phase

Share of guest samples (`--names` seed, ~1 ms epoch); fuel follows the same split to within the
sampler's noise. L2 is 22,418 samples, main 2,116, tail 1,553.

| phase | L2 | main | tail |
| --- | ---: | ---: | ---: |
| emit: function bodies (`emitModule`) | 41.0% | 29.3% | 30.8% |
| check: main pass (`checkProgramPass`) | 33.2% | 36.0% | 36.8% |
| emit: whole-program passes (`runEmitPasses`) | 8.1% | 9.2% | 8.4% |
| check: return-inference pre-pass (`inferReturnsPrePass`) | 7.2% | — | — |
| emit: `elabPrepare` | 4.8% | 8.2% | 7.5% |
| lex + parse | 1.4% | 6.1% | 5.9% |
| rename + rewrite per module | 1.2% | — | — |
| emit: `vl-src` section (`--names` without `-O` only) | — | 8.3% | 7.8% |
| other | 3.1% | 2.8% | 2.8% |

By file, inclusive (the file anywhere on the stack): `emit_classify.vl` 22.2%, `emit_collect.vl`
11.9%, `check_types.vl` 10.2%, `emit_rep.vl` 8.1%, `check_relate_core.vl` 6.0%, `emit_elab.vl`
5.4%. Self: runtime helpers 12.1% (`__map_probe_i32__` 4.0%, `__str_eq__` 2.9%), `ast.vl` 12.0%
(`nodeAt` 5.7%), `check_types.vl` 9.1% (`tyAt` 3.2%), `tyname.vl` 3.7%.

## 4. Top functions by inclusive share of the L2 build

Dispatchers (`checkNode`, `emitStmtIn`, `emitExpr` and the statement walkers) are left out: they
are ~all inclusive and name no work. Off-limits marks a file a step-7 lane is rewriting.

| function | file | L2 incl | main incl | note |
| --- | --- | ---: | ---: | --- |
| `readRepOf` | emit_classify.vl (off-limits) | 9.72% | 0.47% | 7.81 points of it under `exprIsNulNone` |
| `readStoreOf` | emit_classify.vl | 8.27% | | 6.88 of it `readFieldStoreKind` |
| `exprIsNulNone` | emit_classify.vl | 7.98% | | 7.54 asked by `emitExpr` (wasmEmit.vl) |
| `inferReturnsPrePass` | check_top_level.vl | 7.25% | 0% | `preInferOne` → `checkFuncDeclNode`, 6.57 |
| `memberFieldCode` | emit_classify.vl | 6.96% | | → `nulVariantIdxOfExpr` → `readRepOf` |
| `readAtomKindOfTy` | emit_start_block.vl | 6.16% | | `boxTagOfTy`'s render fallback, below |
| `fnDetectScratch` | emit_sections.vl | 5.03% | 3.21% | six body walks per function |
| `elabPrepare` | emit_sections.vl → emit_elab.vl (off-limits) | 4.84% | 8.22% | |
| `placeReadContainerAt` | emit_classify.vl | 4.47% | | → `readAtomKindOfTy` |
| `tyTopIndexOf` | tyname.vl | 3.50% | | a bracket walk over a rendered name |
| `valueAtomKind` | check_ty_rep.vl | 3.37% | | 3.34 under `readAtomKindOfTy` |
| `boxTagOfTy` | emit_rep.vl | 2.83% | | +3.34 hidden by its tail call |
| `unionMemberCount` | tyname.vl | 2.73% | | 1.64 via `nameIsArray` |
| `tyToEmitNameAt` | check_types.vl | 2.49% | | 2.45 under `boxTagOfTy` |
| `runEmitPass` | emit_sections.vl | 1.97% | 2.03% | |
| `tyNameObj` | check_types.vl | 1.71% | | all of it under `tyToEmitNameAt` |
| `a20RetWalk` | check_nj_gate.vl | 1.38% | | five callers, each a body walk |
| `fnHasStrOp` | emit_fn_scans.vl | 1.36% | | one of `fnDetectScratch`'s walks |
| `objFieldType` | check_types.vl | 1.20% | | 0.89 from `assignableGo` |
| `i32ToStr` | ast.vl | 1.15% | | 0.71 building `elabKidsAt`'s string keys (emit_elab.vl) |
| `emitSrcSection` | driver.vl | 0% | 8.27% | `--names` without `-O` only |

## 5. What holds the peak

The live set peaks at the end of emit. On the plumb main unit the null-collector allocation
profile (`VL_PROFILE_GUEST_ALLOC=1`, 518 MB allocated) puts 34% of the bytes under
`checkProgramPass`, 9.8% under `elabRun` (emit_elab.vl), 6.9% under `vcLoadToks` and 5.3% under
`tokenize`, and 3.2% in `satBuild` (driver.vl), the `vl-src` min-tree: `2 × 2^⌈log2 tokens⌉`
cells pushed one at a time, allocated at the live set's peak. The node and token arenas are the
standing two thirds of the live set (2026-09-24's census in `profiling-the-compiler.md`); nothing
measured here moved that, and no cut below is expected to cross a heap-size step.

## 6. The five hotspots

1. **A `null`-unit question per emitted read (L2 ~7.5%).** `emitExpr` asks `exprIsNulNone` of
   every `Member`, `Index` and method-call read before emitting it, and that builds the read's
   whole `ReadRep` (`readStoreOf`, `readFieldStoreKind`, `memberFieldCode`, the narrowed store) to
   test one kind. Hypothesis: a read whose checked type cannot hold the `null` unit (no `null`
   member, no type variable) never has a `null`-unit store, so the call site can skip the
   question. The question lives in emit_classify.vl (off-limits); the call site is wasmEmit.vl.
   Saving is real only for reads no later classifier builds the rep of anyway (`readRepOf` is
   memoized per node).
2. **`boxTagOfTy`'s render fallback (L2 ~6%).** `readAtomKindOfTy` is asked per read by the
   rep layer; when `btOfTy` answers `-2` (a list of a union element, a union whose members share
   a list or closure tag), it renders the type (`tyToEmitNameAt`, whose memo lives one render)
   and re-parses the spelling (`valueAtomKind` → `nulElemListAtomKind` → `unionMemberCount` /
   `tyTopIndexOf`). Hypothesis: a memo keyed by type index, stamped on the tables the render and
   `btOfTy` read, removes the repeat. Files: emit_rep.vl, check_ty_rep.vl, tyname.vl.
3. **The return-inference pre-pass checks un-annotated bodies twice (L2 7.2%).** Every
   un-annotated top-level function is checked in full in the quiet pre-pass and again in the main
   pass. Hypothesis: the pre-pass needs the return type only; a body whose return is a single
   annotated-callee expression could be settled without the full check. This is a design change,
   not a memo. File: check_top_level.vl.
4. **`fnDetectScratch` walks each body six times (L2 5.0%, main 3.2%).** `blockPushPopBits`,
   `leqScanBlock`, `blockHasStrOp`, `blockHasMapOp`, `blockStashMisses`, `collectRefSlots` and
   `mfScan` each walk the function body. Hypothesis: fusing the walks in emit_fn_scans.vl into
   one visit that sets every flag. `leqScanBlock` and `collectRefSlots` live in emit_collect.vl
   (off-limits), so a fusion there waits for w264.
5. **`emitSrcSection` re-derives each row's anchor five times (8.3% of a `--names` debug build,
   0 of the gated ones).** `emitFnSpanLine` is asked twice per row (count, then write), and
   `emitFnSpanCol` and `emitFnSpanModule` once each, plus once per row for the file table; each
   runs `emitFnSpanTokIx`, whose statement rows descend `satFind`'s min-tree. Hypothesis: derive
   the anchor token once per row into a column. File: driver.vl.

Off-limits files hold the largest single mass: `emit_classify.vl` is 22.2% inclusive, and
`readRepOf`'s callers there (`exprIsNulNone`, `memberFieldCode`, `nulVariantIdxOfExpr`) are the
top of the L2 list. Cuts here start at hotspot 1's call site (wasmEmit.vl), then 2, 5 and 4's
emit_fn_scans.vl half; hotspot 3 and the classifier internals wait for their lanes.
