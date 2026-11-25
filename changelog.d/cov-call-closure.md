## Codegen, memory & runtime (Track B)

- **IR claims a closure call's `null` and nullable reference arguments:** `null`, or a nullable record or list, passed to a function value's nullable record, nullable list, `null` or `boolean | null` parameter. In `tests/cases`, `call of a non-declaration` falls from 10 distinct functions and 6 start bodies to 7 and 2 on its programs. In the witnesses it falls from 4 and 4 to 3 and 1.
