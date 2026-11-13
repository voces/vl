## Type system (Track A)

- **Step 7: `unionNameOfCall` no longer returns a union name without its row.** When a declared
  callee's call type keys no row of the return annotation, the rung fails loudly
  (`callNameFloor`) instead of handing downstream readers a rowless name. The path is unreached
  on the corpus.
