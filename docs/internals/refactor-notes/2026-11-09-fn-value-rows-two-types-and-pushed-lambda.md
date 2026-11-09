# Function-value rows: a nested generic called at two types, a pushed lambda at a closed function (2026-11-09)

Lane "function-value rows" (D15595, D15582). Base: master `b2389003` (#6955 merged in), built to a
fixpoint (6,580,581 bytes). The candidate is that master plus this PR, also a fixpoint.

## D15595: what refused, and where

`mid<F>(a: F)` calls `a("x")` and `a(2)`. It is handed `outer<U>`'s nested `same<T>`, which reads
`u`. A probe at `monoPinAnnotatedParam` showed the three spellings take three paths:

| program | path at `mid(same)` |
|---|---|
| `outer(u: i32)` (runs) | bundle, 2 signatures |
| `same` captures nothing (runs) | tagged set `Fn#same` |
| the witness | neither, so `monoArgTyNameCascade` refuses |

`elabBundleSigNote` records a call's signature for a bundle only when the member is nested in
CLOSED enclosers (`elabNestedInClosed`). The fix is in the elaboration: `elabNestedGeneric` also
admits a generic nested function whose parameters are all annotated. Each `outer` instance then
builds one closure per signature at the hand, as the closed encloser already did. Mono only reads
the bundle.

A nested HOLE function (`same(k)`) is left out. Admitted the same way, it builds, and it traps with
`indirect call type mismatch` once `outer` has two instances that differ in type. It stands as D15596.

## D15582: what refused, and where

`elabValueInstSig` already gives the pushed lambda its closed signature. `monoDeliverLamLit`
respells the push's pin from that signature and wrote the function-typed parameter without
parentheses (`((string,i32)=>i32) => void`). `monoFnTypeAnnParamsName` cannot read that spelling,
so `monoCellLamTake` returned 2 and nothing built the lambda. Now the parameter is spelled in
parentheses, as the destination spells it.

## Graded

| program | base | candidate |
|---|---|---|
| D15595's witness | emit reject | `7 x 7 2` |
| `outer(7)` and `outer("s")` | emit reject | `7 x 7 2 s x s 2` |
| `mid` a hole parameter, two `outer` instances | emit reject | runs |
| `same(k)` a hole function, two `outer` instances (D15596) | emit reject | emit reject |
| D15582's witness, and `fs[1](snd)` | emit reject | `2 9`, `9` |
| `snd`'s result annotated | emit reject | `2 9` |
| two lambdas pushed, `inc: (i32) => i32` | emit reject | `2 5 15` |
| D15582's four running ablations | runs | runs |

The fixtures are `generics/capturing-nested-generic-called-at-two-types.vl` and
`closures/closed-fn-into-pushed-capturing-lambda.vl`.

## Measured

| | base | candidate |
|---|---|---|
| sweep, 23,767 programs | | 23,763 same, 0 bytes-only, 4 output movers (both witnesses and both fixtures, emit reject → runs), 0 `runs → not-runs`, 0 new traps |
| rep-fuzz | | exact, 0 failures |
| plumb-shape fuel, main / tail (against its baseline) | | −1.4% / −2.5% |
| self-compile peak RSS (VmHWM, mean of 2) | 3,849,876 kB | 3,849,836 kB (0.0%) |
| late demands | 6 | 6 |
| seed (fixpoint) | 6,580,581 | 6,581,092 (+511, +2.9% of the baseline) |
