## Infrastructure (Track F)

- A maker's first instance now hangs the lambda minted for it off its own slot, as a later
  instance does, so the lambda's captures resolve to their bindings (D17668, lane COV-CLOS). A
  captured f64 or string in a maker delivered at a function type no longer builds an invalid
  module, and the IR claims those bodies (`closure env capture` and `capture binding` → 0).
