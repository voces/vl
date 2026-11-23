# IR: the variant row's full chain over legacy's tail, through `fitRecvReadHook` (2026-11-23, lane IR-N1)

Stacked on #9659. This is option A of the hook-or-parameter question; the coordinator ruled it, on
the queue's recommendation, with five conditions. recordFit uses the same hook in its own PR.

## What landed

- **`variantRowChainTail`** (`wasmEmit`): `emitIsTestVariantRow` past its receiver's staging, split
  out with the same output. It covers the tag, the discriminant, the shared row's fits and the
  cross-row fits.
- **`fitRecvReadHook`** (`wasmEmit`): how a fit writer re-reads a receiver it holds in no slot.
  `emitSharedFieldRecv` and `emitDiscrimFieldEq` read through `fitRecvRead`, which asks the hook and
  falls back to `emitExpr` on its default's sentinel (`fitRecvLegacy`). Legacy bytes are unchanged.
- **`RVariantChain {vcV, vcVi, vcAt}`** in the `box` family. The builder builds the `chain` arm of
  `variantRowArmOf` over a box variable. A chain whose receiver legacy stages into the shared slot
  misses (`is variant row chain staged`).
- **`irFitTail`** (`ir_lower`), the one helper that sets the hook. It pushes the operand, sets the
  hook to `irFitRecvRead` (the operand the first time, then `opndAgain`), calls the tail, and
  restores the hook, the stack and the read count at its one exit, whatever the tail answered.
  `irFitTailSelfTest`, asserted in `tests/vl_ir_shadow_test.ts`, misses on purpose and checks the
  hook is back at `fitRecvLegacy`. A control compiler built without the restore reds it.

## Legacy tails the IR calls

- `variantRowChainTail` (`wasmEmit`): the variant row's chain past its receiver's staging, called by `irFitTail` for an `RVariantChain`.
- `fitRecvReadHook` (`wasmEmit`): the receiver read of `emitSharedFieldRecv` and `emitDiscrimFieldEq`, set by `irFitTail` while that tail runs.

## The IR→legacy-tail hooks the legacy deletion keeps

No document lists them, so this note does. `irVarRepOkHook`, `irIndexHook`, `irMemberHook`,
`irStrBinHook`, `irInPlaceHook`, `irUnionEqHook`, `irListEqHook` and `irListCatHook` (`ir_build`),
`irLowerListHook` and `irStartPrologueHook` (`ir_lower`), and now `fitRecvReadHook` (`wasmEmit`).
The new one is the first that points from legacy into the IR. It exists only because the IR still
calls legacy's fit writers, so it is deleted with them.

## Two traps on the way

- **A hook whose default reaches `emitExpr` gets init-order guards.** With
  `export let fitRecvReadHook = fitRecvEmit` (`emitExpr` itself), the seed imported
  `__print_i32__` for its `__init_fail__` guards, and `refresh-compiler.sh` refused it. A default
  that reads nothing (`fitRecvLegacy`, a sentinel) needs no guard. The refusal is the guard working.
- **A mutable module cell of `Opnd` made checking the compiler 20% dearer** (D17063). The first
  build held the operand in `let fitRecvO: Opnd`, and L2 fuel rose 9.4%, all of it in
  `checkProgram`. A `const fitRecvOs: Opnd[]` stack costs nothing measurable.

## Phase state

`hidden` rises from 16 to 17 in `wasmEmit.vl` (the hook) and from 0 to 4 in `ir_lower.vl` (the
cells `irFitTail` saves and restores, and `lwMiss`, which the self-test saves). The baseline is
written in this PR.

## Bytes and coverage

- `--names`: self-compile identical. `--cases`: differ 0. `--claimless`: differ 0. `tests/cases`
  A/B: same 8,787, differ 0. The moved list is empty.
- The order check (mode 6, in the armed-shadow rows since #9626) reads 0 order rows over the corpus
  (12,304 programs) and over `tests/cases` (8,787).
- `tests/cases`: `is variant row chain` 27 functions and 4 start bodies fall to 0 and 1 (the
  staged one). Covered = matched goes from 71,250 to 71,277 functions and from 6,407 to 6,409 start
  bodies. The corpus and the self-compile census are unchanged.

## Fuel

L2 self-compile, same-tree: base 115,377,665,376, head 115,512,317,939 (+0.117%). By phase,
checkProgram rises 0.09G and the host fetch 0.04G; every other phase moves by 0.02G or less. It is
the cost of compiling the new source.
