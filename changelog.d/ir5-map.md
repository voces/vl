## Codegen, memory & runtime (Track B)

- **Runtime helpers through the IR (§10.1(b), step 3):** the map probes, `__map_get_*__`, both resizes, the resync, the compaction and the list grow helper are built as IR through the helper door and lower to the same bytes their hand-written writers emitted; the writers are deleted. An i64 key's tag keeps one generator (`fbMapTagOfI64`) shared with the inline append.
