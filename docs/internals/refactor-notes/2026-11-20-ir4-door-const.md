# IR door: const initializers, and a fragment's locals against legacy's slots (2026-11-20, lane IR4)

This PR takes the largest arm blocker at the list-literal door, `fragment outside a body`. It also
closes a door soundness gap that the measurement found.

## Const-cell initializers

The only top-level code legacy emits outside the start body's promotion window is each const
cell's constant initializer (`emitConstCellInit`, under `gConstExprEmit`). `lowerNodeIn` now hosts
a fragment there. A constant expression has no frame, so any variable in such a fragment other than
a stack temporary misses with `constant initializer variable`. The tails the IR calls read
`gConstExprEmit` as legacy's do. One example is the `NEW_FIXED_MAX` cap.

## A fragment's locals against legacy's slots

A fragment reads legacy's locals without building their declarations. `irBDeclVar` makes such a
variable at `repNodeOfTy(scopeTyAt(d))`, but legacy's cell may hold another rep. The witness is
`tests/cases/literal-unions/const-literal-join-stored-as-its-set.vl`: a `const` bound to a join of
literal-bound consts holds its set's atom (D14757). The probe pushed that atom raw into a string
list (`node-in array: differ`), where legacy widens it to the member string. The function is not
claimed, so nothing ever shipped those bytes.

Every `local` variable of a fragment now has to agree with the run legacy declared at its slot,
through `irSlotRunAgrees` in `ir_lower.vl`. A scalar rep needs the slot's valtype. A reference rep
must not sit on a scalar slot. `runAgrees` passes every reference rep, so it would miss this case.
A disagreement misses with `local cell rep`. That covers the atom cell and its siblings: a niche or
boxed nullable, and a widened scalar. Whole-function builds keep their path.

## Measured at the door (`emitArr`)

The armed shadow ran over 12,305 `distilled` cells, 7,298 non-`@error` `tests/cases` programs, and
the self-compile, with a seed of this change at dd317d1c6.

| | corpus + `tests/cases` | self-compile |
|---|---:|---:|
| matched | 27,906 | 13,277 |
| differ | 0 | 0 |
| `fragment outside a body` | 0 | 0 |
| `local cell rep` | 10 | 0 |

Before this change, the self-compile matched about 9,866, with 2,440 i32 and 742 string literals
missing as `fragment outside a body`. That figure is from #9196's measurement. `tests/cases` is now
part of every door measurement. #9196's figures covered only `distilled`, which is how the atom
differ went unseen.

No legacy arm comes free yet. Long literals (`array long or seeded`), `array ref`, `open temp type`,
`tag leaf rep` and the element coercions still miss in every arm.

## Controls (`tests/vl_ir_door_guard_test.ts`)

- A literal in a const initializer is hosted and matches. On master it misses with
  `fragment outside a body`.
- The atom witness misses with `local cell rep` and shows no differ. On master it differs.

Both tests fail on master's seed.

## Bars

Fixpoint seeds: master 236a7b27f against this branch on the same base.

| bar | result |
|---|---|
| `ir-identity.sh --names` | identical 9,037, differ 0; self-compile identical |
| `ir-identity.sh --cases` | identical 7,516, differ 0 |
| `--claims` / mode 3 | ok / identical, 16,682 claimed on both |
| armed shadow | 37,312 covered = verified = matched; ok |
| L2 fuel | 100,996,683,203: +0.006% on master (100,991,074,890) |
| pin helpers, `emit_mono.vl` | 905 |
| lint-self, `deno lint`, ladder-sets, dead exports, comment budget | clean |
| phase state, late demands | ok / 307 tag rows |
| `deno task test` | 9,585 passed, 0 failed |

**Lines: compiler +30 / −1, tests +38.**
