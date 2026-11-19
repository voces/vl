## Codegen, memory & runtime (Track B)

- **IR `emitExpr` re-entry retired: `strEqTail`.** A claimed string `==`/`!=` against a quoted literal writes the literal as its own IR operand; the compare is legacy's `emitStrEqLit` split into a form decision, a head and a tail that both emitters call around their own literal write.
