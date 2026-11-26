# The start body reserves a `[]` its pushes fill (lane CENSUS, 2026-11-26)

**Mechanism.** Legacy sizes a fresh `[]` binding for the constant-trip pushes after it
(`listReserveScan`, D3623) wherever `emitStmtIn` publishes its statement list, the start body
included. The IR builder refused a reserve outside a function (`list reserve outside a function`),
because the lowering's `reserveOpen` looked for the `let`'s siblings under a function body only. It
now looks under the program (`emitRootIx`, a `Program`'s `progStmts` included) for the start body
(`fnIx` -1, where `declaredIndexAt` takes the slot as the local), and the builder admits a reserve
in a body built once (`irFnBuiltOnce`).

**Reading** (census probe on this tree's seed; class programs only, regen-9 population on master
eb859a9c6 — 7 programs, all `@start`: 2 cases and 5 witnesses):

| | before | after |
|---|--:|--:|
| programs with the unit | 7 | 0 |
| of those, fully claimed | 0 | 7 |

Each prints what master's seed prints.
