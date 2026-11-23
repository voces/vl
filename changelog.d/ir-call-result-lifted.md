## Codegen, memory & runtime (Track B)

- **IR claims lifted functions that hand captures back after their result, and call results stored as their destination's valtype** (`lifted extra results`, `call result coercion`).
  - The claim gate in `emit_sections` no longer keeps a function with extra results (`fbRetExtra`) on legacy; the IR has built and lowered them all along (`irRetExtra`).
  - A direct call typed at another rep than its callee's result stands as it is when both store at one valtype (`repStoresAs`: a held closure, a ref-element list). This is the same rule #9627 applies at an argument and a global; the verifier's call rule accepts it.
