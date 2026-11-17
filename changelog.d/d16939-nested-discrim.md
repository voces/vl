## Codegen, memory & runtime (Track B)

- **D16939 closed:** record arms that store alike and differ only in a literal set one record deeper (`{ v: { x: 1 | 2 } }` and `{ v: { x: 3 | 4 } }`) answer `is` by value: a binding of one arm is boxed under its own row, not the first row of its shape, and the shared-row fit compares nested literal sets. On master `u is A` was true for every `C` value and `u is C` false for a `C` binding.
