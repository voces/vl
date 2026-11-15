## Infrastructure (Track F)

- **An emit-phase write the emitter's memos could have read is an internal error** (type hash-cons
  stage 4f, step 3a): a `tyEmitEpoch` bump between `elabPrepare` and the end of `emitProgram`
  fails the build loudly instead of leaving a stale memo. Over the corpus there are none; output is
  byte-identical.
