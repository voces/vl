## Codegen, memory & runtime (Track B)

- **B6a-opt:** a `Set` no longer writes or grows its always-`true` `vals` list. Its store and compaction run on helper rows of their own, the struct layout is unchanged, and maps take no new branch. A 3M-entry `Set<i32>` beside a 100k string Set peaks about 10% lower.
