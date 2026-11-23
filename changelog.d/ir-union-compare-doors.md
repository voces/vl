## Codegen, memory & runtime (Track B)

- **IR: a union `==` against a record or across number widths builds in the IR**, through legacy's variant and cross-width doors split into shared route, head and tail pieces. Distilled "union compare plan" 9 → 0; tests/cases programs with a union-compare miss 46 → 15.
