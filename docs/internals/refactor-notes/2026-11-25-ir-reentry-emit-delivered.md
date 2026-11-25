# IR re-entry `emitDelivered`: a bare exact `as`'s returned null (2026-11-25, lane COV-IS)

CENSUS's I8 rehearsal (`scripts/ir-i8-sweep.sh`, `failing.tsv` on `census-i8-rehearsal`) lists 7
tests/cases programs newly failing as `reentry emitDelivered`. All 7 are numeric casts. The IR's
`RNumCast` lowering called `numCastTail` → `numExactCastTail`. A bare `as`'s sad path there
returns the function's own null through `emitReturnValue` → `emitUnionBoxOwed` →
`emitDelivered`, which runs `emitExpr` over a minted null node: a re-entry from a claimed function.

## What landed

- `numExactCastTail` is split byte-neutral into `numExactCastHead` (up to the miss) and
  `numExactCastClose` (the `return`, the sad path's `end`, the conversion). Legacy calls
  `emitReturnValue` between them. `numCastExactSrc` names the exact arms' source as `numCastTail`
  picks it.
- `RNumCast` gains `ncMiss`. For a bare exact `as`, the builder builds the miss null at the result
  (`retDelivered` over `numCastNullNode`, temps only), and the lowering writes it between the two
  halves.

## How it was measured

The I8 sweep tree is a whole-population run; CENSUS owns it. The lane's own check is a probe
compiler: `emitFail("REENTRY <tail>")` at the top of each of the four re-entry tails, which, under
a claim seam (`emitSoftFail`), surfaces as `claim fell back: a legacy helper refused in
`<function>`: REENTRY <tail>`.

| program set | base (master's tree with the probe) | head |
|---|---|---|
| the 7 `reentry emitDelivered` programs | the cast functions re-enter | no `REENTRY` row; every function covered and matched |
| `tests/cases/numerics/as-cast-bare-miss-returns-positions.vl` (new) | 4 functions re-enter (`r1`–`r4`) | 5 of 5 matched, no `REENTRY` |

## The other three ports (not in this PR)

- `emitCoerceAtomPayload` (3): all 3 programs reach it inside `emitArmSiteAt`'s per-arm
  `emitUnionCoerce`, so it goes with the arm-site port.
- `emitNulIsNullTest` (2: `unions/arm-struct-equality-nullable-niche.vl`, D16033). The nullable
  record compare's guard (`nulStructEqGuardTail` → `emitEqRootIsNull` → `emitEqIsNull`) re-reads a
  global side through `emitExpr`. The port splits the guard tail around three IR-built null tests
  (left, right, left).
- `emitArmSiteAt` (22). Per arm, legacy re-enters `emitExpr` on the read node, with the receiver
  overridden to the arm's unboxed list (`luOvEnter`), then boxes it (`emitUnionCoerce`). The port
  needs a per-arm IR body built under those overrides: a structured node in place of
  `armSiteWrite`'s tail.
