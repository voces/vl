## Infrastructure (Track F)

- **Rep ADT stage 0, the shadow and the rebuild counter:** `$VL_REP_SHADOW` now compares every
  local, loop variable, parameter, result and global kind against the rep tree, and counts
  whole-tree rebuilds by emit phase and cause. The readings are in
  `docs/internals/refactor-notes/2026-11-14-rep-adt-stage0-shadow.md`. Unarmed, it moves no byte.
