## Type system (Track A)

- **`===` / `!==` parse as reference identity (D15975, step 1 of 3):** the parser no longer reads them as a JavaScript reflex. The checker refuses an operand with no identity with the `==` spelling (which `check --fix` still writes) and refuses operands no value can share; an accepted identity compare passes `vl check` and is refused at emit, at one counted site with a probe, until the lowering lands.
