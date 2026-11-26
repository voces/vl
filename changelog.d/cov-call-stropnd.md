## Codegen, memory & runtime (Track B)

- **IR builds every string operand as a string (`strPartAt`):**
  - Concatenation and the accumulator append (`out = out + s`) now share one operand builder.
  - A literal-union part decodes to its member string. Before this change the accumulator append missed on such a part.
  - A call that never returns is that call, then the dead string. Before this change both builders missed on it.
  - Newly lowered by the IR: a literal-union value appended in a loop, and `"a" + bail(…)` through a `never` function value.
