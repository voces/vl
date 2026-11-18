# Empty lists a hole template allocates are fresh per call (D16603)

Lane F2, 2026-11-18.

## Mechanism

A hole function's demands are recorded once and re-asked per call (`ifaceSolveAt`) through
`substTyDeep`. That keeps a concrete type's arena identity, so the first call's `constrainEmpty`
pins a template-owned open list IN PLACE and the second call reads the first instance's element.
A bare `h([])` escaped only because `argCstrFitsAt` asks the origin node.

The fix: at the second and later calls, `ifaceSolveAt` installs a per-call map from each such
list's type to a fresh `mkArrayTy(TY_OPEN)`, which `substTyDeep` consults. The first call keeps the
template's own type, so a single-instance program is unchanged. The map is set and cleared around
the steps, with no save/restore global.

## Scope: narrower than "allocated in the template"

The scope is decided from the node, not the type. It covers an empty `[]` in the template's own
frame whose element is open, delivered either directly as an argument of a call through one of the
template's parameters, or by an un-annotated binding declared in that frame whose every read is
such an argument.

Measured outside that scope, before narrowing (235-cell holder × elem × count grid):

| spelling | result if freshened | why |
| --- | --- | --- |
| `Map()` | emit `no $fnsig`, or invalid module in `mk$1` | the elaboration types the ctor from the template |
| `{ ys: [] }` handed whole | 30 invalid modules, 2 emit errors | the record row is the template's |
| `pass(h, a)` relay | 1 invalid module | the relayed hole sees no closed type |
| module-level `xs` | freshened a shared value | binding outside the frame; now excluded |

Each keeps its master refusal. Making them per-instance is emitter work (`emit_elab`,
`monoCtorInitCopy`), not a checker change.

## Numbers (fixpoint seed vs master fe903786)

- Grid: check→RUNS 64, RUNS→RUNS 107, check→check 64; 0 runs→not-runs, 0 clause-1.
- Matrix `empty-list-per-instance-of-hole-template`: 94/94 runs after, 74/94 before.
- ir-identity: 9030 identical, 0 differ; self-compile identical.
- Late demands 10/10; late tag rows 373/373.
- L2 fuel +0.05% on master's own reading; seed +0.05%.
- Rows: D16603 closed; D16602 and D16968 (`Map()`) as filed; D16423 and D5472 are other channels.
