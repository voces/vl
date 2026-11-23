# IR: a captured holder of one bundle member, 2026-11-23

Lane IR-N4. Base: master b03c57be. One of `capture binding`'s five shapes (the bundle parameter
returned and called at one signature, `tests/cases/closures/bundle-parameter-returned-and-called-at-one-signature.vl`).

## Change

`irBDeclVar` holds a `const` keeping one closed member of a returned record as that member's
closure (`holderMemberTy`), and `globalHolderTy` does the same for a module binding. `capTyOf`, the
capture's binding type, did not. The capture's type stayed open, `capRepAtTy` gave no rep, and
`captureRead` missed.

- `capTyOf` takes `holderMemberTy` for a `LetDecl`, under the same guard as `irBDeclVar`.
- A holed capture read whose type is held open returns the capture as it is held, rather than
  retagging it to a rep whose type is open. The value would have no type otherwise, which is the
  global holder read's reason for the same rule.

## Predicates and their legacy callers (R8)

| predicate | callers |
| --- | --- |
| `holderMemberTy` | `emitHolderCall`'s member route, and legacy's cell kind for the holder |
| `irTyHeldOpen` on the read's type | the global holder read's rule, here for a capture |

## Legacy tails the IR calls

- None new.

## Witnesses and readings

`tests/ir-shadow-rows/capture-holder-member.vl` reads a holder of one member in a closure, a lifted
function, a nested closure and twice. Master leaves four functions on `capture binding` and one on
`callee captures`; this branch matches all 21 and the start, with the same output and bytes.

READINGS
