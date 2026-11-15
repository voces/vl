## Type system (Track A)

- **L2 S0's shadow interfaces:** `$VL_IFACES=1` prints, after a build, run or `check --codegen`,
  one `[iface]` row per un-annotated top-level function. It gives the function's parameters as
  named scheme variables, the demand rows it owns, the derived-hole kinds rooted at its
  parameters, and whether each call's recorded result agrees with its result substituted at the
  call's bindings. On the population L2 S0 measured, 98.3% of the covered population's calls
  agree, and every disagreement is function-valued.
