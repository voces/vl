## Codegen, memory & runtime (Track B)

- **Rep ADT 4b, part 2** (`refactor-notes/2026-11-16-rep-adt-stage4b-heapkey.md`): the struct twin
  pass compares each row only with earlier rows of its heap key (`twinChain`, shared with the
  variant pass), and under `$VL_REP_SHADOW` fails on a same-key pair of different layouts outside
  the kept classes. Byte-identical over 8,424 corpus modules.
