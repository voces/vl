# Step 7 codecs: the field-store recover asks the field's storage type, which follows its re-lays, 2026-11-11

This stacks on #7168 (`2026-11-11-step7-codec-field-store-lit-set.md`). After #7168 a field's
storage type reps as the atom wherever the field stores the atom. The code-3 rows were still
off: the literal field the string slot holds. This slice brings those into step too. Then the two
`fieldCodeVKind` readers (the struct construct and the field store) read the field's storage type.

## What changed

- **The storage type follows the storage the code chose.** `fieldStoreTyOf` stores a string-literal
  field that the code puts at the string slot (code 3) as `string`. Two writers do this: the
  anonymous row's lone literal, which stores its base scalar (D5341), and an unregistered inline
  set. The three re-lays that move a field to the string after the fact now write `string` with the
  code: `demoteLitFieldToString` (its arm row and its struct twin) and `famRelayStructRow`.
- **`sFieldStoreKind(si, fi)`** (`emit_classify.vl`) is the kind a struct field is stored at,
  `repOfTy` of its storage type. The field code answers only where no storage type is recorded or
  the descriptor does not cover it. Both `nulNicheRecoverOwed` sites in `wasmEmit.vl` ask it.

## Measurement

The probe compared, at the two sites, `vkNulNicheOf` of the code's kind with that of
`repOfTy(sFieldStoreTy)`. It was validated on a control and built by each side's seed into scratch.
Over the population (`scripts/sweep.vl`, 23,885 programs):

| at the two sites | #7160 | #7168 | this slice |
| --- | --- | --- | --- |
| storage type disagrees with the code | 22 | 2 (D5341's anon lone literal) | **0** |
| descriptor does not cover the storage type (floor) | 66 | 66 | 66 |
| no storage type recorded (floor) | 9 | 8 | 8 |

The floor, by code: 0 (37), 14 (11), 3 (6), 5 (5), 18 (4), 28 (2) and 4 (1) are uncovered. These
are a field whose type still reaches an inference hole (`_`) or a type parameter. The untyped rows
are the spelling-only interns named in #7160 (`d188rp_objnest`, the pinned bound-field reads,
`inline-record-field-holding-generic-application`, `inline-shape-open-span-homes`).

## What is left

- `fieldCodeVKind` survives as that floor's answer only. It goes when a hole's and a type
  parameter's field is typed at its instance, and when the spelling-only interns hand in a type.
- `fieldCodeCellKind` is already the floor of a typed read (`repOfTy` of the storage type comes
  first). `nulScalarListCodeKind` and `listRepOfFieldCode` are asked of codes during interning,
  before any row exists. They go with the codes themselves.
- A deduplicated row keeps its first writer's type (rows at code 14, 37 and 16 in 7 programs). No
  such row reaches the two converted sites (0 disagreements). A reader that does reach them needs
  the row's rep to be the join of the types it serves.

## Proof

- Refresh ×2 is a fixpoint at 6,613,784 bytes. After `vl fmt -w`, the seed is byte-identical (`cmp`).
- `regress.vl`: no runs lost. `rep-fuzz-check.sh`: exact. `lint-self.sh`: clean. The ladder,
  comment and sentinel budgets exit 0.
- The corpus identity and mover list are CI's `sweep` job.
