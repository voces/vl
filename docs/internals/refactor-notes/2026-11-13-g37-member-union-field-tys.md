# D16052 / D16032: `memberUnionFieldName` probes a union's member types, not its label, 2026-11-13

Lane G. The narrowing-blind last resort of `memberUnionFieldName` (emit_classify) looked up the
receiver's union by label (`unionNameOfRead`). It took that union's member atoms through
`unionArmsOfSet`, whose row-less fallback reads `msFreeAtoms`, and paired them index-for-index
with the member types of the read. The atoms served only as the loop bound and the `null` test.

Now the rung walks the member types of the read (`unionMemberTysOfAB`) and skips a `null` member
by type. The label lookup and the atom list are gone.

## Probe

A probe compiler computed the typed answer beside the old one at every call. It ran over 24,020
programs: 301 programs reach the rung, 1,867 calls in all.

- result differs where the label resolved: 0
- the label empty while the typed walk finds a field: 0
- types covered but lengths differ: 0
- `null` by atom ≠ `null` by type: 0
