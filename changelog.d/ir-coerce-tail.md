## Codegen, memory & runtime (Track B)

- **IR coverage: node-keyed list copies and box retags as `RCoerce`.** A node the checker records a `listCopy` or `mapRetag` coercion at missed at `pre-path coercion`. It now builds as legacy's `emitCoerced` writes it: the value past the coercion (`exprPrePathPastCoerce`, what `emitExpr` asks of the `coerceHeld` node), then the coercion's tail (`coerceTail`, which legacy now calls too). A list copy is held at the type it delivers; a retag at the box's own. The other kinds (`recCopy`, `fnClo`, `mapUnbox`) miss by their kind's name.
