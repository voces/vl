# D16215: a check restart clears the slot types its previous pass noted

**Change.** Four lines in `fnTyFactsReset` (`check_elab_cap.vl`): `fnSlotCallAt`,
`fnSlotCallArgs` and `fnSlotAnnTys` are reset with the other type-indexed facts. Every
`checkRestart` site in `check_pins.vl` already calls `fnTyFactsReset`, and the resumed pass
notes the slots again.

**Measured.** `record-param-width-{before,between,after}.matrix.vl` (L3's templates, from
`i-l3-row-param`), master fixpoint against this branch's: `lambda_param` un-annotated moves from
a compiler trap to runs in `-before` and `-between`; 0 runs → not-runs, 0 silent.

**Size.** +4 compiler lines; pin-helper delta 0.
