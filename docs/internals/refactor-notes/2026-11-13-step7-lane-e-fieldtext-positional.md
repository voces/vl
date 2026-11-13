# Step 7: the variant field-type compares read the field's type, 2026-11-13

Lane E. Four readers compared two rows of the variant field identity column (`armFieldTyText`,
`sFieldTyText` once adopted). That column is a render of the field's type:

- `variantFieldTysEq` (emit_collect), the field-type half of `assignTags`' exemption;
- `variantFirstLayoutDisagreeField` (emit_map_twins), the field named by `assignTags`' floor;
- the pair-kind test in emit_shape_rows, which parts arms that genuinely differ;
- `sharedFieldTysIdentical` (wasmEmit), the shared-field dispatch.

## The column is not plain type identity

The column softens a number literal inside a union or nullable to its base, as canon does:
`{x: 1 | 2}` and `{x: i32}` spell `i32` alike, and so do `1 | null` and `i32 | null`. A lone
literal is quoted (`"1"`), a string set keeps its members, and a named literal-union alias keeps
its name.

The probe used a scratch compiler, never refreshed into a seed. At each site it compared the old
text answer with two typed candidates, drained once after `emitProgramRun`, over the sweep's
24,218 programs. A control fired.

| Site | Programs reaching it |
|---|---|
| emit_collect `variantFieldTysEq` | 43 |
| emit_shape_rows pair kind | 44 |
| wasmEmit `sharedFieldTysIdentical` | 1 |
| emit_map_twins floor field | 0 |

| Candidate | Programs disagreeing with the text |
|---|---|
| strict: `tySame` and `armDeclSame` | 9, all number literal sets beside their base |
| keyed: the strict test, with number literals in a union or nullable softened member by member | 0 |

The strict test would change `assignTags`' grouping in those 9 programs. That is a semantic
change, not this refactor's, so the keyed test lands.

## Changed

- `variantRowFieldTysSame(ra, rb)` (emit_variant_sig) reads each row's field in its variant's
  record type (`uVarTyIx`) and applies the keyed test. A row with no arena type is a loud floor
  (`VARIANT_FIELD_UNTYPED_MSG`); the probe found 0.
- The four readers call it. Only lane G's `valueAtomKind(sFieldTyText[at])` reader in
  emit_obj_lit_fits still reads the column.

## Proof

- Refresh ×2: fixpoint.
- Sweep with fixpoint seeds on both sides, master `e39d632e` against the candidate: see the PR.
- `scripts/gate.sh`: all rows pass.

## Next

Once lane G's reader converts, the column has no reader that decides anything. The
`tyToNominalName` render in `collectShapeVariantFields` and the `tyNameOf` render in the declared
arm path can go, along with the column.
