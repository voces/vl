## Codegen, memory & runtime (Track B)

- **D15941:** an un-annotated map of maps can hold a map of an un-annotated function (by `set`
  or by index, nested deeper, or itself held in a record or list), and functions read back
  through it can be called once their signature is pinned. Filed D16121 for a call that reaches
  the function only through the outer map.
