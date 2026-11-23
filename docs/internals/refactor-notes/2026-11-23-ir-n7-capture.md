# IR coverage: a captured call's coerced arguments, a captured walk variable, and an open capture binding (2026-11-23, lane IR-N7)

| Mechanism | Change | tests/cases blocker class, functions (any), before → after |
|---|---|---|
| captured call argument | `capturedCallRhs` delivers an argument on legacy's `widenI64`/`widenF64` arm at its number and on `boxTable`/`boxFloor` at the parameter's union (`deliver`), as `emitCapturedCall`'s `emitWidened`, `emitDelivered` and `emitUnionBoxOwed` write it; `widenF32`, `lit`, `atomStr` and `unbox` stay named misses (`capturedArgDelivers`) | `captured call argument coercion` 15 → 0 |
| captured walk variable | `captureRead` holds a narrowed walk-variable capture at its loop's type (`capLoopTyOf`) where its binding records none | `capture binding` 21 → 7 (with the next row) |
| open capture binding | `capRepFor` takes the read's rep for a capture whose binding type is open in the frame that owns it, where legacy's capture valtype (`captureValKind`) agrees (`capRepAtTy`) | |

Moved on, not closed: `union cast operand rep` 3 → 9 (the simd captured cell), `widen instLit` 15 → 16.

## Measured

Fixpoint seeds: master b292d7ef2 and the batch head.
- tests/cases functions with no blocker: 78,853 → 78,874; covered = verified = matched (one
  unmatched function is the same on both sides).
- Corpus: 45,441 → 45,441 matched. Self-compile: 20,309, identical.

| Predicate the IR asks | Legacy writer it mirrors |
|---|---|
| `capturedArgArmOf` (shared with legacy) | `emitCapturedCall`'s argument arms |
| `capturedArgDelivers` | the arms of `emitCapturedCall` that `deliver` writes alike: `emitWidened`, `emitDelivered`, `emitUnionBoxOwed` |
| `capRepFor` / `capRepAtTy` | `captureValKind`'s env slot valtype |
| `capLoopTyOf` | the loop's element type legacy's env slot holds |

## Legacy tails the IR calls

None new. `deliver` already writes the widenings and the union box on the closure-call path.

## Still open

- `capture binding`, 7 functions: a bundle parameter returned and called, a hole function held
  at `i32`, a record twin, an atom into a string, and a nullable literal union.
