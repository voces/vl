## Codegen, memory & runtime (Track B)

- IR: a returned value `if` whose result bears a `null` builds on the IR, its `end` padded with the
  function's own null, returned, as legacy's `emitNullForRet` writes it.
