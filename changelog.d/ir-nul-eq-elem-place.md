## Codegen, memory & runtime (Track B)

- **IR coverage: a nullable record compared with a list element.** The compare's null tests and
  fields read the element through its place, and their element-read rows are banked. No legacy
  bytes moved.
