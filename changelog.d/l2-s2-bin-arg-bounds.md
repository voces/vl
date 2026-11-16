## Type system (Track A)

- **L2 S2 done: binary-operator and argument rows** (`refactor-notes/2026-11-16-l2-s2-bin-arg-bounds.md`):
  `binCstr` and `argCstr` become `Iface` bounds, so all 11 constraint tables are kinds of `Bound`
  held by the owning declaration. Identical: 20,576 programs fingerprint the same; S2 nets −123
  compiler lines.
