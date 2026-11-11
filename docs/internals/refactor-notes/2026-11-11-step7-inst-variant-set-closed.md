# Step 7 inst: a record type's rep no longer changes during emit, 2026-11-11

Lane w321. `repOf(ty)` must be a function of the type. For a record, `repOfTy` answers `variant`
when `repTyIsVariant(ty)` holds: the checker's union-member set holds the type, or the emit
variant table (`uVarTyIx`, folded in by `rvsSync`) holds its shape. The variant table grows
while monomorphization mints instance unions, so a record could be answered `struct` and later
`variant` in the same compile.

## Measured on master `f570d7f7`

A scratch probe noted each record type's answers in `repOfTy` and any later different one. Over
all 7,732 `tests/cases` programs, three programs flip, each from `struct` to `variant`:

| program | type | struct answers before the flip | flip in phase |
| --- | --- | --- | --- |
| `generics/generic-body-list-union-read-ops.vl` | `{x: i32}` | 5 | `monomorphized` |
| `generics/generic-is-over-anonymous-record-pin.vl` | `{y: string}` | 5 | `arenaFinal` |
| `generics/list-copy-record-at-two-pins.vl` | `{r: i32}` | 5 | `arenaFinal` |

**The consumer.** A probe compiler with names trapped at each of the five early answers in each
program. All 15 come from `monoArgPinName` under `monoPinAnnotatedParam`, while
`monomorphize` names a generic argument's pin. The struct answers reach it through
`exprIsClosure`, `nodeRepIs`, `exprNullableStruct` and `exprVariantIndex`. All three programs
printed their expected output on master, so no stale answer reached a wrong value. No row is
filed.

## Changed

- **The set is closed before emit reads it.** After `elabRun`, `elabInstUnionArmTys` collects
  the record members of every union that an instance's node, parameter or result is typed at,
  through the types that hold one. `repVariantShapesPrime` registers them in the variant shape index as a third source
  (bit 4), so `repTyIsVariant` answers `variant` for them from the first emit-time question.
- **The guard.** `rvsAnswerNote` remembers each record type's answer from the first question in
  the compile, the elaboration's included. It sits where the rep tree builds a record node
  (`rtOfObj`). A later different answer is an `emitFail`:
  `a record type's rep changed during emit, from … to …`.
  Validated on a control (this candidate, with nothing primed): all three programs trip it.
  With the prime, all three run and print as before.

## Measured and left out

The first cut also registered the record elements of a union of lists (`P[] | i32[]`). That
made `unions/inferred-record-literal-list-union-arm-generic.vl` refuse with `ref valtype with
no interned shape`: a shape registered that no variant row ever holds. It is not in the change.
A cut that walked node types alone missed a union in a generic's declared result (D14804's
witness, `readonly (Dot | T)[]` at `T := {r: i32}`). The guard refused it in the full sweep, so
the walk takes each instance's parameter and result types too.
**Open floor:** a union of lists' record elements are not registered. If an instance reads
such an element as an arm before its row exists, the guard refuses the program. The cell that
breaks when they are registered is `unions/inferred-record-literal-list-union-arm-generic.vl`.

The guard watches from the first answer, so the elaboration's own answers are graded too. No
answer the elaboration gives is contradicted later in the full sweep. A probe counted the
record-rep answers given before the prime in `generic-body-list-union-read-ops.vl`, and found 0.

## Proof

- The three witnesses and D14804's run and print as before.
- **Full local sweep**, fixpoint seeds, base `dc782c89` (after merging master, where the rep tree
  replaced `repOfTyFlat`), 23,914 programs: 23,914 same, 0 bytes-only, 0 output movers,
  0 runs → not-runs, 0 new compiler traps. The same holds with the guard watching from the
  prime only.
- **Locally:** `cases_wasm` passes (7,441). `regress.vl` reports no runs lost. `rep-fuzz-check.sh`
  is exact. These pass: plumb-shape-cost, late-demands (6), lint-self with its budgets,
  dead-export, render-parse, kind-ladder sets, `mono-tyaram-grid.sh`,
  `vl_probe_rollback_test.ts`, check-filed-witnesses `--strict` and seed-size (+0.6%). The
  `vl fmt` pass is byte-identical on the seed.
