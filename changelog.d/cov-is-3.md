## Codegen, memory & runtime (Track B)

- IR coverage, box family (lane COV-IS): a read of a map whose values are a union, delivered into a union box, is claimed as its stored box (`mapBox`). An assignment used as a value and boxed by a box whose tag leads is claimed, with the tag written ahead of the store as legacy writes it. Over the programs these classes held: tests/cases distinct functions claimed 316 → 341 of 417, witnesses 18 → 25 of 30.
