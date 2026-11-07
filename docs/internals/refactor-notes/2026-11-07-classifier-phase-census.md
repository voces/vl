# The classifier phase census, committed, 2026-11-07

The 2026-11-07 re-census ([step7-classifier-recensus](2026-11-07-step7-classifier-recensus.md))
was measured with an instrumented compiler that was never committed. It is now one command:

```sh
vl run scripts/classifier-census.vl -- [--callers] [--population P] [--shard K/N] [--rows f.tsv]
```

**What is committed.**

* `compiler/emit_cls_census.vl`: counters keyed by classifier, call site and `emitPhase`,
  armed by `$VL_CLS_CENSUS=1` (`setClsCensus`), read back as `[cls] <path>: <fn>\t<site>\t<phase>\t<n>`
  on stderr after each compile, by `vl build` and by every `vl check --codegen` file, batch
  included. The host side follows `$VL_LATE_DEMANDS` (`arm_cls_census`, `report_cls_census`;
  the variable bypasses the compile cache).
* One probe line, `if clsCensusOn { clsCensusEnter("<fn>") }`, at the top of each of the 112
  classifiers `rep-classifier-census.vl` finds in `emit_classify.vl` with no ARENA read. The
  script re-derives that population every run and names a classifier with no probe, and a probe
  on a function that left the population.
* `scripts/sweep.vl -- list`: the sweep's population (and shard) as `<key>\t<file>\t<run>`, with
  inventory witnesses written, so the census grades exactly what the proof sweep grades.

**Callers.** Off a stock seed every site reads `-1`. `--callers` copies `compiler/` to scratch,
wraps one argument of every direct classifier call in `clsCensusAtI`/`B`/`S(site, arg)` (the
last parameter of type `i32`, `boolean` or `string`), and builds that probe compiler first
(about 60 s). Each wrapped site is numbered and mapped to its enclosing top-level function. A
caller reads `?` when the classifier takes no such parameter (4 of 112: two take a `VKind` or
`RepDesc`, `arrLitRefListRow` an `ArrayLit`) or when a later argument entered another classifier
before the call (`forInVarIsLitAtom`'s `forInElemKind(...)` argument).

**Torn rows.** Each chunk of 100 programs writes its own `<chunk>.cls`; the script reads them
after the fan-out. Nothing appends to a shared file.

**Cost and identity.** Unarmed, a classifier entry pays one boolean test. Seed 6,436,623 →
6,444,134 bytes (+0.12%), fixpoint. Sweep over 23,610 programs, base master `f92d874b`:
23,610 same, 0 bytes-only movers, 0 output movers. A full `--callers` census takes 2 min 50 s
on 4 cores (1 min 52 s of it grading), against about 100 lines of patching before.

## The census on master `f92d874b`, 23,610 programs

| class | functions |
| --- | --- |
| called only after monomorphize | 6 |
| called only before monomorphize | 4 |
| called in both phases | 102 |
| never called | 0 |

1,212,492 classifier calls before monomorphize finishes, 46,361,399 after. "Before" is
`passes` plus `monomorphizing`.

Post-only: `forInVarStructIdx` (8,288 calls, 2,158 files), `callLoweredKindOf`,
`readCallStoreKind`, `letCellSlot`, `recBuildRowOf`, `vkNonNullRefTwin`. The re-census listed
five; `mapRetExprShape` is deleted since, and `readCallStoreKind` and `letCellSlot` were not in
its list (it set the eight storage-column functions apart).

Pre-only, with their callers: `letIsClosure` 768 (`letInitCellKind`), `arrLitRefListRow` 98
(one caller, `anonFieldElemName`), `letInitLoopElemKind` 10 (`captureValKind`
6, `letIsUnion` 4), `letIsNulRefArray` 6 (`letInitCellKind`).

Fewest pre-monomorphize calls among the 102: `moduleCopySigKey` 2 (`calleeCloSigKeyOfRead`),
`loopVarReadIsAtom` 3 (`loopVarPinTyOf`), `forInVarIsLitAtom` 21, `letRefListElemName` 33
(`criRetRefListElemName` 21, `refListElemNameOfIdent` 12), `readCellKind` 36. Every caller
named here is in `emit_classify.vl`.
