## Codegen, memory & runtime (Track B)

- **IR builds the structural-eq helper bodies.** Each `__eq_<row>__` is an IR function in the frame `eqHelpFnCode` opens: its two parameters compared by `REqHelp`, which lowers through `eqHelpTail`, the compare `eqHelpFnBody` wrote. The claim path writes the helper, and the shadow compares it, as it already does for the closure thunks. In tests/cases all 23 helpers in the 5 programs match, and `legacy module: structural eq helper` in `ir-only-census` now counts only what legacy still writes. Legacy's bytes don't change.
