# Step 7: the variant field-type compares read the field's type, 2026-11-13

Lane E. Four readers compared two rows of the variant field identity column (`armFieldTyText`,
`sFieldTyText` once adopted). That column is a render of the field's type:

- `variantFieldTysEq` (emit_collect), the field-type half of `assignTags`' exemption;
- `variantFirstLayoutDisagreeField` (emit_map_twins), the field named by `assignTags`' floor;
- the pair-kind test in emit_shape_rows, which parts arms that genuinely differ;
- `sharedFieldTysIdentical` (wasmEmit), the shared-field dispatch.

## The column is storage identity, not type identity

The column softens a number literal inside a union or nullable to its base, as canon does:
`{x: 1 | 2}` and `{x: i32}` spell `i32` alike, and so do `1 | null` and `i32 | null`. A lone
literal is quoted (`"1"`) and a string set keeps its members. `assignTags` groups by layout, and
a number literal set stores as its base number, so this is the design (coordinator's ruling).

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
| the storage row: `armFieldStoreTy` compared by type | 11: the same 9, and 2 record fields |
| keyed: the strict test, with number literals in a union or nullable softened member by member | 0 |
| keyed, but a named literal-union alias compared strictly | 0 |

The storage row keeps the declared set (`fieldStoreTyOf`), so it cannot stand in for the column.
The keyed test lands, without an alias case, since no program reaches one.

## The alias edge

`type K1 = 1 | 2` in a field is the same type as the inline `1 | 2`, so `{x: K1}` and `{x: 1 | 2}`
are one union arm and never reach a positional compare. Against `{x: i32}` both spellings group
alike. A string-set alias against its inline set is the same. All of these run identically on
both seeds.

Checking the nullable spelling found D16031: a `1 | null` field read through an un-narrowed
`R | S` is refused at emit when the literal arm comes first, and runs as `S | R`. The alias and
the inline set fail alike, so it is not an alias defect; it is the number-literal sibling of
D15882.

## Changed

- `variantRowFieldTysSame(ra, rb)` (emit_variant_sig) reads each row's field in its variant's
  record type (`uVarTyIx`) and applies the keyed test. Its contract: fields are identical when
  they store alike, and a number literal inside a union or nullable stores as its base. A row with no arena type is a loud floor
  (`VARIANT_FIELD_UNTYPED_MSG`); the probe found 0.
- The four readers call it. Only lane G's `valueAtomKind(sFieldTyText[at])` reader in
  emit_obj_lit_fits still reads the column.

## Proof

- Refresh ×2: fixpoint.
- Sweep with fixpoint seeds on both sides, master `e39d632e` against the candidate with the alias
  case: 24,218 same, 0 bytes-only movers, 0 output movers, 0 `runs → not-runs`, 0 new compiler
  traps. Dropping the alias case changes no answer the probe reached.
- `scripts/gate.sh`: all rows pass.

## Next

Once lane G's reader converts, the column has no reader that decides anything. The
`tyToNominalName` render in `collectShapeVariantFields` and the `tyNameOf` render in the declared
arm path can go, along with the column.
