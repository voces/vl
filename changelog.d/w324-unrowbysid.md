## Codegen, memory & runtime (Track B)

- **Step 7, D16032: union `==` reads its operands' member sets from their types.** It was the last
  place that looked a union up by its name; four name-keyed lookups it alone used are deleted.
  Every program that reaches it builds byte-identical.
