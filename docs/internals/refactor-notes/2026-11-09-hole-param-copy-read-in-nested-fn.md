# Step 4: a copy of a hole parameter read by a nested function forwards per encloser (2026-11-09)

Lane "D15011 and the function-value rows". Base: master `67362572`, built to a fixpoint
(6,570,731 bytes). The candidate is that master plus this PR, also a fixpoint.

## What refused, and where

`run(h) { let hh = h; function inner() { for f in [apply2] { f(hh) } } inner() }` with `run(add)`
and `run(mul)` (D14843). The same program handing `h` itself ran, because `inner` reads `run`'s
parameter and so is built per `run` instance (`elabReadsEnclParam`). A copy was no such read, so
`inner` had one body for both instances, and `elabAliasSetFwd` declined the copy's read there
(D14842's rule).

| producer | change |
|---|---|
| `elabReadsParamOf` | a read of a copy of the encloser's un-annotated parameter (`elabParamCopyOf`) counts as a read of the parameter, so the nested function is built per encloser instance |
| `elabAliasSetFwd` | a copy's read in a nested function built so forwards through a set call as at that instance (`elabSetFwdTarget` at `elabInstUnder`). A hand-on to a named function forwards either way, as the parameter's own nested read does in `elabMintHandedNested` |

The first candidate counted any un-annotated parameter as the encloser's. That built
`(x) => x`'s owner per instance and made `generics/type-parameter-list-copy-into-concrete-param.vl`
invalid wasm, the sweep's one `runs → not-runs`. Only a real copy counts now.

D14843's program was the witness of three rows about an emit refusal (D15154, D15483, D1666),
`vl_check_json_test.ts`'s emit-stage test, and the live-sites probe. Each now also calls the copy
in the nested function, which still refuses with the same message.

## Measured

| | base | candidate |
|---|---|---|
| sweep, 23,749 programs | | 23,747 same, 0 bytes-only, 1 output mover, 0 `runs → not-runs`, 0 new traps; the refusal pin renamed to a run fixture (1 only in each) |
| the mover | emit reject | D14843's witness runs |
| rep-fuzz | | exact, 0 failures |
| plumb-shape fuel, main / tail (against its baseline) | | −1.8% / −2.8% |
| self-compile peak RSS (VmHWM) | 3,954,980 kB | 3,955,608 kB (+0.0%) |
| seed (fixpoint) | 6,570,731 | 6,571,535 (+804; +2.7% of the seed-size baseline) |

## What stands

A copy also called in the nested function (`print(hh(10, 20))` in `inner`) still refuses: the
alias forward needs every read of the copy to be a hand-on. A copy of a copy read two nested
functions deep refuses too, as `inner` reads nothing of `run`'s and is not built per instance.
Handing `h` itself runs in both.
