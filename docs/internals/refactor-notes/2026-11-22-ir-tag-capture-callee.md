# IR coverage: a tagged call's captured callee is read as its cell stores it (2026-11-22, lane IR-N7)

This follows `ir-tag-global-closure` (#9585), on the capture side of the same class: IR-N6's H2
ablation, `capture binding` i32 → closure, 22 tests/cases functions. A closure writes a binding
holding a tagged set's id (`let k = inner; const flip = () => { return k = other }`). Delivered at a
closed function type, the binding reaches legacy's adapter as a capture, and the adapter's body is a
tagged call through it:
- **Legacy:** `emitFnTagDispatch` writes the callee with `emitExpr`, which on the `capture` arm is
  `emitCapturedRead`: the environment's field as stored, the member id.
- **IR:** `captureRead` read it at the callee's checked closure rep. `capRepFor` gives the `i32`
  cell, so it missed `capture binding`.

## Change

- **`tagCallee`** (`ir_build.vl`) also reads a callee on legacy's `capture` arm, of a closure that
  is not lifted, as the environment slot holds it: `capRepOf`'s rep, typed at the binding's own
  type. It does so only where the read's checked rep differs.
  - `captureRead` is unchanged. IR-N6's open capture work owns it.
  - A lifted closure's capture still takes `captureRead`'s path.
- **New row:** `tests/ir-shadow-rows/tag-capture-callee-closed-type.vl`.

## Measured

Over all of tests/cases, L1 builds from the same seed (#9585's head as base):
- covered = matched 69,295 → 69,317;
- `capture binding` 112 → 90;
- starts unchanged;
- no mismatch row moved.

An earlier draft called `captureRead` at the cell's rep. The read then carried the callee's
closure type at an `i32` rep, and the verifier refused it (rule 3) in 22 adapters.
