# IR cutover C4: the scalar binary-operator writer, 2026-11-17

Lane IR3. An op-seam slice under `ir-design-2026-11.md` §10. C1 made the opcode one table; this
slice deletes what stayed duplicated around it, the writer. `CLAIMED` stays empty. Measured on
fixpoint seeds of this branch and its master base (`f4e2f50d`).

## Survey, before the slice

A throwaway tally instrument, never committed, counted each candidate family's legacy sites
through the shadow's `[ir]` channel: the self-compile armed, and the distilled `cells/` + `named/`
(12,297 cells). Ranked by legacy lines deleted per IR line added:

| family | self-compile | corpus | context mismatches | estimate |
|---|---:|---:|---:|---|
| scalar binary-operator writer (this slice) | 77,854 | 151,828 | — | net ≈ −35 |
| user-global read / write (`globalRead`, `SGlobalSet` beside `emitUserGlobalGet`/`Set`) | 43,988 / 8,659 | 22,348 / 9,284 | 0 / 0 | net ≈ −12, IR lines only |

Not matched, because a decision is still unshared: unary `-` (the IR flips an immediate's bits,
legacy folds through `emitSignedNumLitAt` and `wNegateConstFrom`), direct calls, returns and
control flow (argument delivery and coercion, I8), and immediates (the literal widening arms are
named misses).

## What landed

- **One width-generic arm.** `emitBinNumeric` maps the checker's width (`binNumWidth`) to a
  `RpPrim`, then writes one sequence: float `%` to the helper, the shift-mask fold at an integer
  width, the opcode from `lexOpcode` (refused when -1), the two operands, `fbI32Bin`. The f32, f64
  and i64 arms are deleted. A width other than the four (`boolean`) stays on the i32 arm.
- **Float `%` is two shared halves.** `f64RemOperandTail` (promote an f32 operand) and
  `f64RemCallTail` (the helper call, then demote) are called by `emitF64RemCall`, the numeric union
  pair writer `njPair` and the IR's `floatRem`. The helper-reserved refusal moved into the call
  half, so it is written once.

The old i64 arm fell through to the i32 tail when the operator had no i64 opcode. The checker keeps
every accepted program off that path, so it now refuses, as the float arms always did.

## Occurrence count (constraint 3)

A second throwaway counter, built from this branch, recomputed the old ladder's arm at every
`emitBinNumeric` and compared it with the width-generic arm's prim.

| population | operators | mismatches | by arm |
|---|---:|---:|---|
| self-compile | 77,843 | 0 | i32 77,573 · i64 257 · f64 13 |
| distilled corpus | 151,828 | 0 | i32 118,758 · i64 30,513 · f64 2,501 · f32 46 · float `%` 10 |

**Failing control.** The same counter compared the raw width with the prim. It reported 63
mismatches on the self-compile and 3 on the corpus, every one a `boolean`-width `==`/`!=`.
`f64RemCallTail` was reached 20 times in the corpus: the 10 legacy remainders and the IR's
lowering of the same 10 under the shadow.

## Bars

| bar | reading |
|---|---|
| self-build | the master fixpoint seed and this branch's seed build identical bytes from this source (fixpoint at the second compile, 6,588,865 bytes) |
| corpus identity, master seed against this seed, 12,297 cells | 9,023 identical, 3,274 fail under both, 0 differ |
| L2 self-compile fuel | 95,044,903,776 to 95,049,251,120 (+0.005%) |
| seed size | 6,588,971 to 6,588,865 (−106) |
| compiler lines | +56 / −85 over two files, net −29 |
| `emit_mono.vl` pin helpers | untouched |
| phase-state census | the same as master's |
| `ir-shadow.vl` (armed, in the gate) | corpus 24,100 of 24,100 matched; self-compile 5,743 of 5,745 |
