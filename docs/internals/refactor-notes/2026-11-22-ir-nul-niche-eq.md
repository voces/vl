# IR coverage: `==`/`!=` over nullable references on legacy's `nulNiche` route (2026-11-22, lane IR-N7)

`operand type`, probed on master dfc71b02 with the miss naming the operator and `eqRouteOf`'s
answer, is 182 `tests/cases` functions, split by legacy's route. The coordinator assigned the
whole class to this lane, one route per PR. The first route is `nulNiche`, 57 functions: a
compare where an operand is a nullable reference (string, list or closure), neither side a
`null` literal.

## Design

- **Plan and tails (`wasmEmit.vl`).** Legacy's `emitNulNicheEq` is rewritten over four tails, and
  the IR writes the same ones:
  - `nulNicheEqHead`: the three blocks;
  - `nulNicheEqLeftTail`: `br_on_null` to `$lnull`;
  - `nulNicheEqRightTail`: `br_on_null` to `$onenull`, then `emitEqNonNullCore`, the rep's compare;
  - `nulNicheEqNullTail`: both null is true, one null is false.
- **`nulNicheEqWhy`** answers "" where legacy writes that guarded compare. It is read off legacy's
  own `binEqNulNiche` (a `nulstruct` goes to `emitNulStructEq`) and `exprIsLitAtom` (an atom
  operand takes `emitEqOperandRaw`'s string arm). Both of those are named misses.
- **`RNulNicheEq { neL, neR, neAt }`**, routed where `eqRouteOf` answers `nulNiche` (R8).
  - The guard reads the right operand twice, once on each path, so the builder takes it only as
    a variable; an expression is a named miss.
  - The verifier holds both operands at reference reps, and the answer a bool.
  - Family `other`, so claiming does not widen.

## Measured

On the 18 `nulNiche` witness files, against master's seed:
- covered = verified = matched 506 → 546, with no mismatch;
- the 11 left are `nullable record eq`, the next route's.

Legacy bytes are identical on all 18. The row `tests/ir-shadow-rows/nullable-niche-eq.vl` has 5
functions; all 5 are `operand type` on master's seed, and here all 5 are covered and matched. The
full table is in the PR body.

## Fuel

L2 self-compile fuel rises 122.0M (+0.11%) on 108,982,556,926 at base dfc71b02. Under the
coordinator's 2026-11-22 ruling it is source growth:
- **The same-tree pair.** The head's seed compiles the base tree at exactly the base seed's fuel,
  108,982,556,926 both.
- **By phase, head on head against base on base:** `checkProgram` +0.07G (one more `Rhs` member,
  D17046), and the emit passes, code payload and `emitModule` +0.02G each.
