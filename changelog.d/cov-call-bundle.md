## Codegen, memory & runtime (Track B)

- **IR claims calls through a bundle record's place and straight off its call:** `xs[i](4)` and `lap(f)(5)`, where the callee holds or returns one closure per signature. In `tests/cases`, `indirect call` falls from 4 distinct functions and 4 start bodies to 1 function on its programs (legacy's own D16747 refusal). In the witnesses it falls from 2 start bodies to 0.
