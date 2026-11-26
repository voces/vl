# IR: an assigned parameter is written at its own variable (lane COV-CLOS, 2026-11-26)

An assignment to a name resolves its target's variable (`irBDeclVar`), which serves a `let`'s
declared local; a parameter has no declared slot, so assigning an un-annotated parameter (`a = dbl`,
`n = n + 1`) missed `local slot`. A read of a parameter already resolves it to its own variable
(`paramVarAt`); the assignment now does the same.

## Measurements

MEASUREMENTS_PLACEHOLDER
