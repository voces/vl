# Step 7 L2 §7: mono's annotation nodes are built from the pin's type, 2026-11-10

The clone-binding note (`2026-11-10-step7-l2-clone-binding-by-type.md`) handed the next lane
`monoPinAnnSpelling`, the render behind mono's annotation text, with 40 call sites. This PR takes
the sites whose text only becomes a TypeRef node, and whose caller already holds the type that
node records. Those nodes are now built from the type (`synthTypeRefOfTy`), so the spelling is
output text and nothing composes it.

The base is master `e7ebdb52`, with a fixpoint seed on both sides. The population is the whole
sweep: 23,868 programs.

## Changed

10 of the 40 call sites go:

- **Four nodes built in place**: `monoMintedLetAnn`, `monoLamParamPinAnn`,
  `monoPinNestedListElems` and `monoPinSlotRecordMap`.
- **The `spell` out-parameter family.** `monoStoredSlotFnTy`, `monoUncalledSlotFnTy`,
  `monoHeldRecordListAt`, `monoPinStoredRecords` and `monoPinMapSlot` each pushed a spelling
  beside the type they return. The spelling was assembled from `monoPinAnnSpelling` (3 sites
  in `monoPinMapSlot`, 1 each in the other three) and `monoSigFnTyNameAt`. Its four consumers
  are `monoPinListRecords`, `monoUncalledListElems`, `monoPinNestedListElems` and
  `monoPinMapValues`.
  Each of them wrapped the text in a TypeRef node over the type it already held. The parameter
  is gone, and those nodes are now built from the type.
- **Gates.** `monoUncalledSlotFnTy`, `monoHeldRecordListAt`, `monoPinStoredRecords`,
  `monoLamParamPinAnn` and `monoPinSlotRecordMap` refused when the spelling was empty. They now
  ask `tyIsEmitRepresentable` of the type.
- `synthTypeRefOfTy` (`emit_rewrite.vl`) is exported. It is the one place that renders a node's
  text from its type.

## Probed

The probe was an accumulator in a scratch compiler that was never refreshed into a seed. A
program that fired a probe failed at the end of `emitProgram` with the ids it fired. A program
that failed for another reason first hides its probes, so these are counts over the programs
that otherwise build.

| site | reached in | spelling ≠ `tyToEmitName` | gates disagree |
| --- | --- | --- | --- |
| `monoMintedLetAnn` | 3 | 0 | — |
| `monoLamParamPinAnn` | 705 | 1 | 0 (empty in neither) |
| `monoPinNestedListElems` | 1 | 0 | — |
| `monoPinSlotRecordMap` | 4 | 0 | 0 (empty in neither) |
| `monoHeldRecordListAt` | 22 | — | 0 |
| `monoUncalledSlotFnTy` | 88 | — | 0 |
| `monoPinStoredRecords` (per field) | 11 | — | 0 |

The one text mover is `closures/captured-cell-shared-writer-hole-lambda-i32-and-literal-union.vl`.
There, `monoPinAnnSpelling` names a literal union by its alias where the render spells it out.
Its wasm is byte-identical, because the node's reader asks the type it records.

## Not cut here

The other 30 sites feed a string that a later reader parses back or keys by. They need that
reader to take the type first:

- **The binding spellings** (`tvV`): `monoDefaultAnnTyParams`, `monoBindTyParamElab` ×2,
  `monoPushPins`, `monoPreBindPastUnionRest`, `monoBindEnclosingPins` and
  `monoArgTyNameRep`.
- **`monoCoerceFnValueName` / `monoCoerceFnValueTys`' `tname`**, which
  `monoFnTypeAnnParamsName` parses into parameter names: `monoCoerceBundleArgs`,
  `monoCoerceAtValueParams`, `monoCoerceListCbArg`, `monoBundleNamedPin`, `monoHeldValueAt`,
  `monoHandWrittenLet` and `monoPinTyParamComposite` ×2.
- **The union registry by name** (`monoRegisterValuePin`): `monoLamPinRetAnn` and
  `monoMakeInstanceParams`. This is L6.
- **Callback parameter names** (`monoCellLamTakeAt`'s `pnames`, the delivery signature text):
  `monoListCbLamAt`, `monoPinMapLambdas`, `monoNoteBindDeliveryCall`, `monoDeliverLamLit` and
  `monoCbFnListRowSpell`.
- **Returned spellings**: `monoInstanceRetSpelling` and `monoPinNominalSpelling` ×2.

The cut that unlocks the most sites is `monoCoerceFnValueTys` reading the parameter types from
`tnameTy` in place of `monoFnTypeAnnParamsName(tname)`. It removes the `tname` argument from 13
callers.

## Proof

- **Byte sweep.** `sweep.vl record` over the whole population with the master fixpoint and with
  the candidate fixpoint: 23,868 of 23,868 are the same, with 0 bytes-only movers, 0 output
  movers and 0 runs → not-runs.
- The render-parse ratchet does not move (39 / 70). `monoPinAnnSpelling`'s own render is still
  reached from the other 30 sites.
- **Locally:** refresh ×2 byte-identical, rep-fuzz, lint-self, seed-size, late-demands,
  dead-export, render-parse, pin-helper budget, cases_wasm 0–3, inventory refs/rows,
  `vl_scaling_shape`, `vl_probe_rollback`, plumb-shape-cost, self-compile-time, and
  `check-filed-witnesses --strict` on both inventories.
