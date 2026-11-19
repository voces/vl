## Codegen, memory & runtime (Track B)

- **Runtime helpers through the IR (§10.1(b), step 2):** `__log__`, `__init_fail__` and `__as_fail__` are built as IR through the helper door and lower to the same bytes their hand-written writers emitted; the writers are deleted. A relocated i32 constant (`RRel`) and an `i32.load` raw op join the helper-only raw family.
