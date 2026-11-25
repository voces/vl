## Codegen, memory & runtime (Track B)

- IR coverage, store arm write (lane COV-UNION): inside `is K[]`, an element write through a box of list arms is `SArmWrite`, legacy's per-arm chain (tag test, payload cast into the arm's wrapper, the store over it), claimed byte-identical through legacy's shared pieces; `store arm write` 6 → 0 on its programs.
- IR coverage, field store arm unbox (lane COV-UNION): a union box narrowed to a record arm stored into a field of that arm is delivered through the IR's arm unbox, as legacy's `emitArmDelivery` writes it; `field store arm unbox` 6 → 0 on its programs.
