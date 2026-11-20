## Codegen, memory & runtime (Track B)

- **IR: an empty list literal of a union variant's records builds as the plain short list.** `const none: Tok[] = []` at a ref-list slot whose element is a non-null variant row was `array ref` (9 self-compile functions, 13 node-in misses). `arrLitRefPlainSlot` refuses that row only when there are elements to coerce into the arm; legacy writes the empty literal as the backing and wrapper alone on both arms.
