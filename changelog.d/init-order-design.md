## Type system (Track A)

- **Initialization order, Phase 1 design:** `docs/internals/init-order-design-2026-11.md` specifies
  the compile-time init-before-read rule (definite assignment carried through resolved calls) and
  the rescue-only reordering of effect-free initializers, and lists eleven choices for the owner.
  Measured: 31 of 15,787 corpus programs that build carry today's guard (21 trap, 10 run); 5 would
  be newly rejected once the scan's name-matching artifacts are fixed; 0 std or compiler modules.
