## Codegen, memory & runtime (Track B)

- **D17566 closed (lane COV-UNION):** a `?.` field read under `??` in a hole identity whose argument an instance adopted at a record runs; the IR plans it as that record row's field (`coalFieldPlanOfOpt`), where legacy's `??` ladder reads the template's hole types and refuses (listed legacy-wrong).
