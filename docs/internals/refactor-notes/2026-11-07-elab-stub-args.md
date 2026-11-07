# The elaboration's own stub keys (D15494), shadowed

Measured 2026-11-07 on master `9bb7e8d8` plus this change, 4-core box.

## What moved

Mono's prime `monoElabStubArgsPrime` keys an argument made only of hole functions that no call
reaches at the `() => void` stub (the D4551 default: a hole function nothing calls has no
instance). The elaboration reads that key (`elabStubArg`) when it binds the call. The
elaboration now carries the rule itself: `elabStubArgsPrime` in `compiler/elab_stub.vl`. It is
the same predicate over the same value-reach index, run from `elabPrepareRun` at the point where
mono's prime runs.

In this PR it runs only under `$VL_ID_SHADOW=1`, the identity shadow's report-only mode. There it
reports one `stub-shadow <verdict> <call>:<arg> <stub>` row per key either table holds, plus a
`stub-shadow keys <own> <mono>` summary row. Mono's keys still feed the elaboration.

Why it is gated and not run alongside mono's: a second value-reach index build in the same
compile reorders the module's type section. Ungated, it moved 30 programs bytes-only with no stub
involved (for example `closures/generic-list-literal-of-generic-to-generic-twice.vl`: `[id]` asks
the index, `id` is called, there is no key, and types `$0..$4` come out permuted). The switch PR
runs exactly one build at the same position, so it is not exposed to this.

## Shadow

`scripts/sweep.vl -- list` population (23,610 rows), each file built at `$VL_ID_SHADOW=1`:

| | count |
| --- | --- |
| programs that reached the prime | 19,073 |
| programs with a stub key | 56 |
| keys: agree | 104 (99 `() => void`, 5 `(() => void)[]`) |
| keys: differ | 0 |
| keys: old-only (mono only) | 0 |
| keys: new-only (elaboration only) | 0 |

The earlier census (102 stubs in 54 of 23,103 programs, in the exit-census note) counted a
smaller population. Here every key is accounted for, and both tables are equal key for key.

## Proof

- Fixpoint: `refresh-compiler.sh` twice, byte-identical.
- Seed: 6,451,734 bytes for the master fixpoint, 6,456,431 for the candidate (+4,697, +0.07%).
  This is the shadow's code. The switch PR deletes mono's copy.
- Sweep, master fixpoint against the candidate: 23,610 same, 0 bytes-only, 0 output movers,
  0 `runs → not-runs`, 0 new traps.

## The switch (PR 2)

`elabStubArgsPrime` now runs unconditionally from `elabPrepareRun`, in the slot where mono's prime
ran, and writes `elabStubArg` itself. `monoElabStubArgsPrime` is deleted, along with its five
helpers (`monoPrimeInert`, `monoInertStubTy`, `monoStubFnTy`, `monoBreaksTo`, `monoInertFnsAt`)
and the shadow. That takes emit_mono from 943 to 937 functions; the pin-helper baseline is 937.
Measured on master `b055cc92` (which includes PR 1) plus this change:

- Seed: 6,476,942 bytes for the master fixpoint, 6,472,375 for the candidate (−4,567; the
  shadow's code leaves with mono's copy).
- Sweep: 23,610 same. No output movers, no bytes-only movers, 0 `runs → not-runs`.
- D15494's witness (a refutation pin) grades `runs`, as filed.
