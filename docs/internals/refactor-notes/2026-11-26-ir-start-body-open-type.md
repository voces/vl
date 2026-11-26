# A start body holds an open type at the rep it is built at (lane CENSUS, 2026-11-26)

**Mechanism.** Rule 1 refuses a temp whose type still has a type variable (a hole function's
value, a generic no call instanced), because an instance could rebuild it at another rep. A start
or init body is built once (`irFnBuiltOnce`), so no instance changes any rep: the builder's
`ibTyOpen` answers "held" there for a typed node at a rep, and `irNoteVerifyFacts` notes the same
for the body's open variables (`irVarHeldIds`). It covers the `open temp type` sites that have a
rep in scope (24 of 26; `printUnionIf` and `tagDispatchAt` keep `irTyOpen`) and the shared member
callee's open field kid.

**Reading** (census probe on this tree's fixpoint seed; class programs only, regen-9 population on
master eb859a9c6 — 25 programs carried `open temp type` or `shared member callee kid`):

| | before | after |
|---|--:|--:|
| programs with an `open temp type` / `shared member callee kid` unit | 25 | 0 |
| of those, fully claimed | 0 | 17 |
| of those, stopping at another class | 25 | 8 |

The 8 move to: `array element coercion` 3 (COV-UNION), `call of a non-declaration: top-level
lambda record` 3 (COV-CALL), `coalesce nulRef result rep` 1, `shared member callee receiver` 1.
Every newly claimed `tests/cases` program prints its `@log` lines.

Not covered: `closure temp at an open type's rep` (11 programs) and `parameter rep unsup` are in
generic instances (`g`, `g$1`), which are built once per instance; they need the instance's own
closure rep, a separate change.
