## Infrastructure (Track F)

- **`$VL_TOUCH_SET=1`, each function's touch set:** a compile prints one `[touch]` row per
  top-level function naming every module global it, or anything it calls, reads or writes, closed
  over the effect summary's call edges, with a `lambda` or `unknown` flag where the set may be
  short. An instrument for the init-order work (`init-order-design-2026-11.md` §2.1); nothing
  reads it, and with the variable unset all 15,787 corpus programs that build emit byte-identical
  modules.
