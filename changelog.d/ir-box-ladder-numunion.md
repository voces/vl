## Codegen, memory & runtime (Track B)

- **IR coverage: a numeric union delivered into a union box passes as its box.** The box plan sent every numeric union to legacy's ladder (`box ladder`). Legacy's ladder re-boxes one member by member only when a member must widen to a kind the box holds (`emitNumUnionRebox`), and otherwise passes the box as it stands. The plan and legacy now ask one predicate, `numUnionReboxes`, so only a numeric union that legacy re-boxes stays on the ladder.
