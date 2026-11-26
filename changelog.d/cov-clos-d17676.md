## Infrastructure (Track F)

- A closure returning a captured hole parameter returns it at the row the capture slot stores,
  so the module validates (D17676, clause 1). The function's result row, its `$fnsig` key and a
  binding's read of the closure follow that row, as a named function's result already does.
  Filed alongside: D17681 (a check refusal) and D17682 (the holding positions, and a function
  returning its own parameter).
