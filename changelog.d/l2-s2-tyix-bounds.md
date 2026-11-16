## Type system (Track A)

- **L2 S2 begins: the scheme is the record** (`refactor-notes/2026-11-16-l2-s2-tyix-bounds.md`).
  `printCstr`, `arrDefCstr` and `nestCstr` become `Bound`s on each owner's `Iface`
  (`compiler/check_iface.vl`); a call reads its callee's and module scope's rows in today's order.
  Identical: the fixpoint seed's fingerprint over 20,535 programs is unchanged.
