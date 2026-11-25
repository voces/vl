## Infrastructure (Track F)

- **`ir-i8-sweep.sh` deletes write-only module state:** the unread-`let` step no longer counts a pure write (one line storing a literal, a name, `[]`, `Map()` or `Set()`) as a read, so a container only its resets name goes with those resets, and so does the comment block above it; a name any function also binds is left alone. On master `--apply` now deletes 34 lets instead of 6, and the applied tree's unused-state budget reads 0 write-only containers (it reddened at 8).
