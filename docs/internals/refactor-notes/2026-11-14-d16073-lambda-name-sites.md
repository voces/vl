# D16073: the emitter's lambda tests after the rename (2026-11-14)

`collectFns` names every lambda `__lambda_N`, and sixteen emit-time tests of `fnName == ""` ran
after it, so none saw a lambda. Lane I graded `vrFnValue` (two tests), one of which was a real
trap (D16075). This grades the other fourteen and makes each say what it means.

## Method

One scratch compiler with all fourteen tests restored to `fnNameIsLambda` (ast), swept against the
master `8f6978b8` fixpoint seed, then a hand probe per site aimed at its lambda branch.

- Sweep, 24,325 programs: 0 output movers, 0 bytes-only movers.
- Master's compiler source built by both seeds: byte-identical.
- Ten probes, each built by both seeds: byte-identical modules.

## Change

Three conjuncts are dropped where the next test already rejects a renamed lambda (`elabTopFn`,
`elabRetCalls`, `monoPruneTemplates`). `elabLamPerEncl`'s two-part prefix test becomes
`fnNameIsLambda`. The other ten tests become `fnNameIsLambda`: inert today, but a future lambda
shape now takes the branch the test was written for. The shipped tree measures as the scratch
build did: 0 movers, 0 bytes-only movers, master's compiler source byte-identical.
