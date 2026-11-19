## Codegen, memory & runtime (Track B)

- **Runtime helpers through the IR (§10.1(b), step 4):** the scalar and record list view helpers (`__sv_*__`, `__rv_*__`) are built as IR through the helper door, one builder per operation for both kinds, and lower to the same bytes their hand-written writers emitted; the writers are deleted.
