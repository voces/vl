## Codegen, memory & runtime (Track B)

- **Rep hole-instance, step 1** (`refactor-notes/2026-11-16-rep-hole-instance-step1.md`): an
  anonymous record row is keyed at the literal's own type where its context still names a type
  variable. The heap shadow's hole-or-generic merges fall 22 → 12 (15 → 9 files); 2 corpus
  modules change bytes and print the same.
