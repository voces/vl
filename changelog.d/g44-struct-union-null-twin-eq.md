## Codegen, memory & runtime (Track B)

- **D16038:** `==` and `!=` between a record union and the same union with `| null`
  (`P | Q` beside `P | Q | null`) compile in either order, comparing by tag and then by fields.
