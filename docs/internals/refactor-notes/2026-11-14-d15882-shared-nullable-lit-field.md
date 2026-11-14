# D15882 + D16031: literal-set-or-`null` fields through a union of records (2026-11-14)

A shared field read over an un-narrowed union of records (`u.k`, `u: R | S`) dispatches on the
box tag through `sharedUnionFieldPlan`. Two rows refused it with `field access receiver is not a
struct` when the field was a literal set beside `null`. The ablation shows two mechanisms, both
in `sharedFieldPlanDispatchable` (wasmEmit), and one neighbour in the same plan.

## Ablation

A scratch compiler printed the plan's code and each member's stored field code at the floor.

| witness | plan code | members store | declined because |
| --- | --- | --- | --- |
| D15882 (`K \| null` in both) | 30 | 30, 30 | code 30 admitted only when a member stores a bare `null` |
| D16031 (`1 \| null`, `i32 \| null`) | 16 | 16, 16 | the two boxes' element types differ (`armFieldElemSame`) |

Neither is #7965's identity path: no `==` between operands of the field's type is involved.

## Change

- Code 30 is always dispatchable: atoms are interned program-wide and every member's niche reads
  `-1` as `null`.
- Two value-union boxes are dispatchable when both element types are value boxes
  (`armFieldsBoxAlike`): tags are global per atom kind and a literal rides its base scalar's tag.
- `sharedFieldNulStrPlan` admits a member storing a string set at the atom or its `-1` niche
  beside `string | null`; `emitSharedFieldSetToStr` widens the atom and maps `-1` to `null`.
- `coalBoxFieldScalarKind` takes a shared read that delivers its members' boxes
  (`sharedReadDeliversBox`), so `u.x ?? d` over D16031's shape lowers.

Nothing is narrowed: no refusal sentence changed.

## Measured

Capability matrix, 14 templates `matrix/shared-nullable-lit-field-*.matrix.vl` (string set in both
members, string set or `K` beside `string | null`, lone number literal, number set; both member
orders; `null` named first for the string set and the lone literal), 72 cells each, master
`2509180f3` fixpoint seed against this branch's fixpoint seed:

- 1,008 of 1,008 cells run after; 144 ran before (the two number-set templates, whose members
  store the same type). 0 `runs -> not-runs`, 0 silent, 0 program traps.
- D4266 (then-arm read of a cross-arm `is`, atom beside `string | null`) moves from emit reject to
  runs, printing `a`; a `B` holding `"zz"` fails `is A` and prints `B`.

Sweep, the same two seeds: 24,344 the same, 0 bytes-only movers, 3 output movers (the D15882,
D16031 and D4266 witnesses, `emit_reject -> runs`), 0 `runs -> not-runs`, 0 new compiler traps.

Neighbours still refused, filed: D16048 (a `K | null` niche beside `i32 | null`) and D16049
(nullable refs of different types). D16049 replaces D4266 as the top-level field-access witness
in `selfhost_native_diag_pos_test.ts`.
