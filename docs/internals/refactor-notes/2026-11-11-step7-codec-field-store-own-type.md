# Step 7 codecs: an anonymous row in a generic body records its own field types, 2026-11-11

This stacks on #7179 (`2026-11-11-step7-codec-field-store-kind.md`). Earlier notes said a row
serves several reps because it keeps its first writer's type. That is wrong, and this note
corrects it. A census naming each mismatched row and its stored type found no deduplicated row
among them. The disagreements were writer bugs in the recorded type, and this slice fixes the
largest. The orchestrator's split ruling was premised on that finding, so it has no case to act
on.

## The rows that disagreed, named

Every typed field row was compared with its stored type: the code's kind against
`repOfTy(sFieldStoreTy)`. Two kinds of difference are accepted as agreement: a code-15 row the type
refines (`nulvariant`, `nulnone`), and an atom code against an atom type. The probe was an
`emitFail` marker in a scratch build validated on a control, over 23,885 programs. Disagreeing
programs on #7179:

| family | programs | the row | the recorded type |
| --- | --- | --- | --- |
| an `#anon` literal in a generic body, `{f: (t) => {}}` | 2 (D14161, `record-literal-built-at-instance-function-field`) | code 14, the literal's own closure | `((T) => void) \| null`, the destination |
| the same, `{f: null}` | 3 (D13968, `generic-declared-record-result-function-field-row`, `generic-function-into-nullable-function-slot`) | code 37, `null` only | `((T) => void) \| null`, the destination |
| a numeric literal union field, `{k: z}` with `z: 1 \| 2` | 2 (D2541, `union-field-literal-row-positions`) | code 16, the union box | `1 \| 2`, which `repOfTy` reps as `i32` |

In the first two families the row is right. D14161's close builds each instance's literal at its
own stamped rep, but `anonRowTyIx` records the type-parameter-bearing destination.

## What changed

- **`anonRowStoreTyIx(objIx)`** (`emit_rep.vl`) is the record type an anonymous row's fields are
  stored at. Where `anonRowTyIx` still names a type parameter, it is the literal's own type, unless
  that type reaches an inference hole. `collectA` stores the row's fields at it. The row's identity
  (`anonRowTyIx`) is unchanged.
- **`fieldStoreTyOf` stores a code-37 field at `null`.** That is the field a literal holds only
  `null` in, whatever the context's nullable type.

## Measurement

| disagreeing programs (typed rows) | #7179 | this slice |
| --- | --- | --- |
| generic-body `#anon` closure rows | 2 | 0 |
| generic-body `#anon` `null` rows | 3 | 0 |
| numeric literal union in the box (D2541) | 2 | 2 |

The first try took the literal's own type unconditionally. That moved
`closures/record-pushed-onto-literal-records-of-wider-set-beside-returned-list.vl` to a stored
type of `(_) => _`, which `repOfTy` covers as `i32`. The hole guard was added for it. The compiler
traps over the population are the base's 7, with none new.

## What is left

- **D2541's numeric literal union.** The `one-literal-union-rep` ruling gives a numeric literal
  union its base scalar, and this field stores it in the union box. Moving it to `i32` changes the
  layout, so it is its own PR.
- **Demoted literal fields.** After #7179, `demoteLitFieldToString` stores them at `string`, which
  agrees with the code. This is the case the ruling's application leaves as a string: a variant
  layout family where the same field also holds a plain `string`, so the field's type is the join,
  `string`.
- **Holes and type parameters.** Those rows stay uncovered by design, and the code answers there.

## Proof

- One refresh (CI re-proves the fixpoint).
- `regress.vl`: no runs lost. `rep-fuzz-check.sh`: exact. `lint-self.sh`: clean.
  `cases_wasm_*`: 7,436 passed.
- The static budgets and `vl_scaling_shape_test.ts` are run before push.
- The corpus identity and movers are CI's `sweep` job.
