# A held closure at an open type's rep is typed at that rep's type (lane CENSUS, 2026-11-26)

**Mechanism.** Inside a generic's instance, a binding that held a generic function and then a
lambda (`let k = other; k = (n) => …`) is a closure at the open type's uniform closure rep, while
the checker types the value at its instance's closed type (`(i32) => void`). Rule 3 refused the
temp because that type's own rep is not the rep it is held at. `irBLetTempTy` now types such a temp
at the rep's own type (`repTyOf`) when rule 1 already takes that type as held (`closureHeld`), so
type and rep agree; nothing else changes.

**Reading** (census probe on this tree's seed; class programs only, regen-9 population on master
eb859a9c6 — 11 programs carried `closure temp at an open type's rep`, 5 cases and 6 witnesses):

| | before | after |
|---|--:|--:|
| programs with the unit | 11 | 0 |
| of those, fully claimed | 0 | 11 |

Every case prints its `@log` lines; each witness prints what master's seed prints.
`parameter rep unsup` and `open local type` are a different mechanism and do not move.
