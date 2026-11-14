## Codegen, memory & runtime (Track B)

- **Step 7: the shared-field plan over a struct union reads member types, not atom spellings.**
  `sharedUnionFieldPlan` counts a union's members, walks them and skips a proven-absent `null`
  from their types. It was the last atom-spelling reader outside the member-set key. Every
  program that reaches it builds byte-identical.
