# Step 7 codecs: design for retiring the field code, 2026-11-11

The field code (`sFieldTypes`, `armStageTypes`, the `FC_*` vocabulary in `emit_state.vl`) is a
second stored encoding of a record field's rep. Five slices measured and narrowed it: #7160,
#7168, #7179, #7199 and #7220. This note records what they established, and the cut order that
retires the code. Each cut is one PR, on the critical path.

## What is established

- **Every typed, covered field row's stored type reps the way its code stores the field.** The
  census compares the code's kind with `repOfTy(sFieldStoreTy)` on every row, over the sweep
  population (23,885 programs). It went from 752 disagreeing programs to 0 after #7220. Two kinds
  of difference count as agreement: a code-15 row the type refines (`nulvariant`, or `nulnone` for
  a hole's record), and an atom code (0, 30) whose type reps with `rdAtom`.
- **No row serves two reps.** The disagreements were writer bugs:
  - the arm mint read `tyIx`, not `fieldsTy` (#7160);
  - a lone or string-slot literal (#7168, #7179);
  - a generic body's `#anon` literal (#7199);
  - a numeric literal union in the box (#7220).

  So no split of field rows by rep is needed.
- **Two floors remain where the code is the only answer:**
  - rows whose storage type the descriptor does not cover: an inference hole (`_`) or a type
    parameter, 66 programs at the two recover sites;
  - rows interned from a spelling with no type (20 programs, #7160's census).

## The rep a row stores

`fieldRowRep(row)` is the rep of `sFieldStoreTy[row]` (`repOfTy`) when that type is recorded and
covered. Otherwise it is the floor table `fieldCodeRep(code)`, one exhaustive map from code to
rep. A code carries more than a `VKind`, so the accessor answers a `RepDesc`:

| code | `rdKind` | also needs |
| --- | --- | --- |
| 0 | `i32` | `rdAtom`, which tells a literal-union atom from a plain `i32` |
| 30 | `i32` | `rdAtom` and the `-1` sentinel (`rdNul`) |
| 3, 20 | `str`, `nulstr` | |
| 21 | `nulbool` | |
| 15 | `nulstruct`, `nulvariant` or `nulnone` | the struct row, already `sFieldTgt*` |
| 16 | `union` | the box's union name, already `sFieldElemName` |
| 14, 22 | `closure`, `nulclosure` | the `$fnsig` key, already `sFieldCloSig` |
| 19, 29 | `map`, `nulmap` | the mv slot, already the elem columns |
| 4–6, 18, 25–28, 31–36 | the list reps | the ref-list slot, already the elem columns |
| 17, 23, 24 | `f64`, `i64`, `f32` | |
| 37 | `nulnone` | |

`fieldRowRep` inherits `repOfTy`'s union-membership rule: a record that is a union arm reps as
a variant, and its row is laid out as a variant row. That rule is load-bearing for record
identity (w321 confirmed it), so it stays. The census above was measured under it, and the
byte-identical claim for cuts 1–3 depends on it.

No column is added. The storage type is the column, and the companion columns that already
exist (`sFieldElemName`, `sFieldElemTyIx`, `sFieldCloSig`, `sFieldElemKeyKind`) stay the slot.

## Where the code is read today

Static references to the code (`FC_*`, `sFieldTypes`, `armFieldTypes()`, `sFieldTypeAt`,
`memberFieldCode`, `armStageTypes`), by file, a grep count meant only to size the work:

| file | refs | file | refs |
| --- | --- | --- | --- |
| `wasmEmit.vl` | 246 | `emit_bytes.vl` | 52 |
| `emit_shape_rows.vl` | 154 | `emit_anon_fields.vl` | 51 |
| `emit_classify.vl` | 128 | `emit_field_codes.vl` | 47 |
| `emit_shape_intern.vl` | 75 | `emit_eq_rows.vl` | 37 |
| `emit_obj_lit_fits.vl` | 52 | `emit_list_rep.vl` | 28 |
| `emit_collect.vl` | 52 | 13 other files | 101 |

The readers fall into three groups:

1. **Row readers**, which hold `(si, fi)` or a `memberFieldPos` row (`sFieldTypeAt`,
   `fieldPosCode`, `memberFieldCode`). They convert to `fieldRowRep`. #7179's two recover sites
   are the first converted.
2. **Code-to-code transforms**, which hold a code and no row. These are the equality frames
   (`eqScalarListFieldKind`, `nulFieldInnerCode`), the nullable-list wrappers
   (`nulScalarListCodeKind`, `nulScalarListFieldWrapHeap`) and `forceScalarListField`. They
   become rep-to-rep transforms once their callers hand them a rep.
3. **Interning-time code arrays** (`codes[]` in the shape interns and `collectA`), compared by
   the dedup keys (`annShapeIndexOf`, the `#anon` field-set key). These become rep arrays. Two
   rows then share exactly when their field reps agree, which is today's rule restated, since a
   code is a function of the rep. The exception is `nulnone`: code 15 (a hole's record, which has
   a struct-row companion) and code 37 (the `null` unit, which has none) both rep as `nulnone`.
   The key must keep the companion, or those two would merge.

## Cut order

1. `fieldRowRep(row)` and `fieldCodeRep(code)`, with the group-1 readers of one file converted
   per PR. Each PR is byte-identical, graded by the local sweep, `wasmEmit.vl` first.
2. The group-2 transforms take a rep, file by file, byte-identical.
3. The group-3 arrays hold reps. The dedup keys compare reps, and `forceScalarListField` takes
   one. Byte-identical by the census above.
4. The writers stop computing codes. `nameFieldCodeTy` becomes the field's rep from its type,
   and the spelling ladder (`fieldCodeOfSpelling`, `nameFieldCode`) answers only the spelling-only
   floor. This cut lowers the render-parse baseline.
5. Type the floors: holes and type parameters at their instance (step 2's per-instance node
   types), and the spelling-only interns' callers hand in a type. Then `fieldCodeRep`, the
   spelling ladder, `sFieldTypes` and `armStageTypes` are deleted, along with the decoders
   `fieldCodeVKind`, `fieldCodeCellKind`, `listRepOfFieldCode`, `listRepOfFieldCodeFrom` and
   `nulScalarListCodeKind`.

Cuts 1–3 change no output. Cut 4 can move a row only where a spelling and its type disagree, and
cut 5 is behaviour by construction. Each is graded by the local sweep (velocity amendment 3).

## Open, owned elsewhere

D15730: `{ k: null }` at an inline `{ k: 1 | 2 | null }`.
Its registry half is w316's, and w314 finishes it after that lands.
