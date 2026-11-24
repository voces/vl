## Codegen, memory & runtime (Track B)

- **IR coverage, the assignment-value box rep:** an assignment used as a value whose target is a union box and whose value is the member written is built as the target's box re-read, and each delivery owing the member unboxes it at its own heap, as legacy writes both. Graded by two committed position matrices (`assignment-value-union-box-{global,local}-at-member`): 47 of 66 cells each newly covered and matched, the rest named. In tests/cases, `uncovered global read coercion` 3 → 1; no legacy bytes moved.
