# D16369: a call treats a pre-pass result holding a hole as provisional, 2026-11-15

Lane G. Builds on D16381 (#8186).

With its functions declared last, D16209's map store `m["k"] = pick(true)` stored a value of no
type, printing `32` alone instead of `6`, `32`. It needs `const n = pick(false)`.

## Mechanism (probe build, counters on `inferRetPublish`)

- The module's quiet pre-pass infers `pick` for `const n`. `ap2`, `ap3` and `pick` each publish
  `_`, and the rollback keeps `pick`'s `_`.
- Pass 2 publishes `ap2` and `ap3` as `_` (hole relays) and `pick` as `i32`, in both orders.
- With the declarations last, `m["k"] = pick(true)` is checked first. It read `_`, which is not
  the pending `-2`, so `checkCallOnFuncTy` did not check `pick`'s body.
- A probe after the pre-pass's rollback read `pick.fnRet` as the hole.

## Change (`check_calls`, net compiler lines +7; pin-helper delta 0)

`checkCallOnFuncTy` checks the callee first when its result holds a hole, it has no return
annotation, and pass 2 has not checked its body (`fnInferredUnchecked`), as it already does for
`-2`. A hole relay's own `_`, published by pass 2, is final and is not checked again.
- The first version left out the annotation test. An annotated generic's `U` holds a hole, so a
  recursive one (`rec<U>` in the d2567 named cells) re-entered its own body without end. Regress
  showed it as a hang, not a red cell.

## Grading

`--before`: the seed of #8186's branch.

- D16369 prints `6`, `32`. D16381's witness, D6322 and D15596 hold.
- 574 hole, inferred, return, fn and generic templates (the first version): 0 runs→not-runs, no
  cell changed. The cells that are SILENT or TRAP are the same on both seeds.
- On top of #8201 (master `7e5a0ce4` and later):
  - `regress.vl`: 0 runs→not-runs. 11 `dord*` cells move to runs, and their baseline lines are
    rewritten.
  - `decl-order-ab.vl`: master's 85 movers, 6 of them clause-1, fall to 72 movers and 2 clause-1,
    none new. The baseline is rewritten.
  - The witnesses of D16281 and D16301 run. Each is re-graded to the one remaining mover it owns,
    reduced (`c4([dbl], 2.5)` builds an invalid module, and a returned closure over `[inc0, half]`
    traps).
  - `check-filed-witnesses --strict`: 5099 graded, all as filed.
