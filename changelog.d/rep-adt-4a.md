## Infrastructure (Track F)

- **Rep ADT stage 4a:** a default-off heap-identity shadow (`$VL_REP_SHADOW`) counts the merges a
  rep-keyed `heapOf` would make. Over the corpus, 1,061 merges keep their layout, and 151
  struct-row merges in 31 files would fuse different layouts, all of them records holding function
  sets. So stage 4 waits on function storages becoming reps:
  `docs/internals/refactor-notes/2026-11-16-rep-adt-stage4a-heap-shadow.md`.
