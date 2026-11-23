## Codegen, memory & runtime (Track B)

- **IR: a variadic push appends its arguments in bulk (`method push`).** `xs.push(a, b)` builds in the IR as legacy's `emitPushMany` writes it. The receiver is staged, legacy's own run literal of the arguments is built (minted once per call and instance, `pushManyRunLit`), and the bulk append follows (`pushManyOpen`, `pushManyRecvTail`, `pushManyTail`, the node `RListPushMany`). A spread argument (`push(...ys)`) is still legacy's.
- **IR: a `for` iterable literal in a fully unrolled range copy reads the module constant list legacy hoists for that copy.** The range variable is bound to the copy's constant on legacy's copy stack around the hoist's question (`urBindConst`, `urUnbind`). Legacy bytes are unchanged.
