# IR: a rolled range loop (2026-11-21, lane IR-D1)

Coordinator ruling, 2026-11-21: take `statement`, the builder's fall-through for a statement kind
with no arm.

## The family

A debug build named the node kind at the fall-through over 212 files (tests/cases, probes,
witnesses):
- `ForRange`: 319 of 385 rows. The IR had no arm for `for v in a to b`.
- A local `TypeDecl`: 36 rows.
- A discarded literal or member read (`StrLit`, `Member`, `NullLit`, ...): the rest.

A second debug build counted legacy's arm for each range loop in those files
(`emitForRangeStmt`):

| arm | loops |
| --- | --- |
| rolled, static step, no hoist, no proof | ~273 |
| fully unrolled | ~165, plus 10 in getters |
| partially unrolled (4×) | ~80 |
| hoist or range proof active | ~50, overlapping the rows above |
| dynamic step | 6 |

## The change

The rolled arm only, built from §1.2's existing nodes. The coordinator preferred that, and
legacy's bytes come out of them, so no loop node was added:
- the loop var's `SAssign`, then the bound's when it is not constant, each at the slot the
  collect pass declared for the `ForRange` (`declaredSlotOfDecl`, the bound one past it);
- `SBlock` (break) around an `SLoop`, whose body holds:
  - the test (`lt`/`le`/`gt`/`ge`) as a temp, with `while`'s exit `if c {} else { br }`, which
    lowers to legacy's `eqz; br_if`;
  - the body, inside an inner `SBlock` when it holds a `continue` to this loop, as
    `blockHasContinueFor` decides;
  - the step as a temp `add` and an `SAssign`, then `SBr` to the loop.

**One decision.** `forRangeArm` (wasmEmit), "unrolled" | "partial" | "rolled", is what
`emitForRangeStmt` dispatches on (its unrolled call takes `forRangeUnrollPlan`'s values), and the
IR reads the same function. That answers IR-REV's veto of a parallel arm predicate. The IR builds
only "rolled", and only when `forRangeRolledBlock` finds no dynamic step, wrap exit (`rangeMayWrap`,
legacy's own), hoist or range proof.

**State-free gates.** The hoist and proof gates read only the tree: any `loopHoistCands`
candidate, or a positive step from a non-negative literal toward a hoistable path. They never read
the live rows that `hoistCandRow` and `liveListRowOf` consult while legacy writes. A shipped claim
is decided before legacy writes the function, so a live-row reading there disagreed with legacy's
in `--cases` (tests/cases/arrays/basics.vl and lists/index-guard-in-range.vl, a start-body loop
over a hoisted receiver). Each gate answers yes wherever legacy might hoist or prove, so a loop it
admits has neither.

Two more named misses:
- A range loop inside an open list reserve region (D3623), where legacy's pushes append through
  its locals.
- A list reserve in the start body, which `reserveOpen` lowers only in a function. That was
  latent: a start body was never covered past its range loops.

`census.sh` now flushes each row alone. Its parallel chunks share one output file, and a block
flush had split rows: base and candidate looked one function apart in distilled, where a
per-file reading is identical.

## Measured vs merge-base 108db3fd (fixpoint seeds on both sides)

I8 census, functions claimed and start bodies claimed:

| population | functions | start bodies |
| --- | --- | --- |
| self-compile | 19,199 → 19,202 | 138 → 138 |
| distilled | 43,372 → 43,372 (per file) | 7,602 → 7,602 |
| tests/cases | 58,277 → 58,317 | 4,070 → 4,090 |
| capability probes | 473 → 473 | 133 → 135 |
| filed witnesses | 16,849 → 16,864 | 3,062 → 3,080 |

`statement` falls from 379 to 68 first misses across the populations. The new first misses are
`for range unrolled` 76, `partial` 51, `getter` 8, `wrap exit` 5, `hoisted` 5 and
`dynamic step` 2. `claim fell back` is the same 4 rows as on the base.
