# Step 4: a list join under a forwarder binds at the union too (2026-11-09)

Lane "function-value rows 7". Base: master `1c0410c7` plus #6925 (D15577), built to a fixpoint
(6,571,890 bytes). The candidate is that base plus this PR, also a fixpoint.

## What refused, and where

`fwd(id); fwd(id3)`, where `fwd(f)` calls `take(f, id2)` and `take` lists `a` and slot-writes `b`
(D15578). A probe on the elaboration's keys showed `take` already keyed at the union
`{id, id2, id3}`, and also at `({id}, {id2})` and `({id3}, {id2})`. Those two are the hole-pin rows
recorded under each `fwd` instance, which #6925 left at their own binding. Mono's demand from
inside a `fwd` instance takes the row's instance (`elabCallInstFrom`), so each one called the list
at two types.

Re-keying the instance rows alone made D15573 (`fwd(id)` once) refuse at `fwd(id)`. A
`--names` trap gave the frame `monoPinHoleParam → monoArgPinName → monoArgTyNameCascade`, where
`fwd`'s bound type `{id}` was no longer tagged. A trap on `fnTagMark` showed that `{id}` had been
tagged by the late decision (`elabPrepare → fnTagRedecide`), as a sub-need of `{id, id2}`. A
probe on `ftPlan`/`ftScan` found the plan of `{id2}` failing at `ftCtxOk` for `id2` in
`take(f, id2)`. That decision reads the call at `fwd`'s template, where `f` is an open hole, so
`fnTagListJoinSetOf` answered -1. Once `take` was bound only at the joined set, it no longer took
`{id2}` alone.

| producer | before | after |
|---|---|---|
| `elabHoleRowJoinTys` | re-keys root rows only | re-keys a row under an instance too |
| `fnTagListJoinSetOf` | -1 where a joined argument is open | the union of every call's hands, when it has two or more members and holds each closed argument's set (`fnTagListJoinOpenSet`) |
| `fnTagHandOnJoinTy` | follows an argument that reads a parameter | also through a `const` copy (`fnTagParamCopyOf`) |

The third row came out of the first sweep. That sweep lost one `runs`, the fixture
`list-of-hole-param-slot-written-forwarded-through-const-copy.vl`: its `const g = f` hid the
hands from the union, so the re-keyed row and the template's join disagreed again.

The same join through two forwarders (`fwd2(g) { fwd(g) }`) still refuses, on base as well as on
the candidate. Its elaboration keys are right, so the refusal is in mono's pin. Filed as D15579.

## Measured

| | base | candidate |
|---|---|---|
| sweep | 23,749 programs | 23,747 same, 1 bytes-only, 1 output mover, **0 `runs → not-runs`, 0 new traps**, 2 only in the candidate (D15579, the new fixture) |
| the output mover | emit reject | runs: D15578 |
| the bytes-only mover | `arrays/long-literal-widths-exact.vl` | built alone, byte-identical on both seeds: the batch's chunking moved |
| rep-fuzz | | exact, 0 failures |
| plumb-shape fuel, main / tail (against its baseline) | | −1.8% / −2.8% |
| self-compile peak RSS (VmHWM) | 3,955,240 kB | 3,954,788 kB |
| seed (fixpoint) | 6,571,890 | 6,572,156 (+266) |
