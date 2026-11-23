## Codegen, memory & runtime (Track B)

- **IR coverage: a captured binding holding one member of a returned bundle.** For example, `const r = lap((a) => a + k)`, called at one signature and read in a closure or a lifted function. The IR now holds the capture at that member's closure, as it holds the local, and a read whose type is open takes the member as captured. `capture binding` 7 → 6 tests/cases functions. No legacy bytes moved.
