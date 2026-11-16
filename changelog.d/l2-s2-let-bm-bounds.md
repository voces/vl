## Type system (Track A)

- **L2 S2, write and builtin-method rows** (`refactor-notes/2026-11-16-l2-s2-let-bm-bounds.md`):
  `letCstr` and `bmCstr` become `Iface` bounds; `Bound` gains a third operand and the shared
  check-order stamp. Identical: 20,568 programs fingerprint the same on the fixpoint seed.
