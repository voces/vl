# Step 7 L6: five more `unionNameOfExpr` readers ask the box's member set; census 5 re-graded, 2026-11-12

## The readers

This is the second batch of lane I's half of `unionNameOfExpr`'s callers (lane G's split). Each
reader below handed the name to a registry question that falls back to the spelling when the type
misses. It now asks the box's member set (`msSetOfTy` / `msSetOfUnionBox`) directly.

| caller | before | now |
| --- | --- | --- |
| `exprIsUnionStrEq` ×2 (emit_fn_scans) | `unionHasAtomAB(.., name, ty, "string")` | `msSetHasAtom(msSetOfTy(ty), "string")` |
| `emitScalarMapReadBoxEq` | `un == ""`, `unionSetHasNullTy(un, ty)`, `unionHasAtom(un, atom)` | `exprUnion`; `msHasNull(set)`; `msSetHasAtom(set, atom)` |
| `emitIsTestArmTag` | `unionCarriesLitUnionArmOfSet(set, name)` | `msSetCarriesLitUnionArm(set) == 1` |
| `emitUnionLitIs` | `uname == ""`; `isValueUnionOfSet(set, uname)`, `unionCarriesLitUnionArmOfSet(set, uname)` | `set < 0`; `msIsValueUnion(set) == 1`, `msSetCarriesLitUnionArm(set) == 1` |

`msSetHasAtom` (emit_fn_scans.vl) answers verbatim atom membership from the set's recorded atoms,
and answers false for no set.

**Kept on the name:**
- **`printUnionPlanCode`.** The candidate that dropped its name fallbacks moved **24 programs from
  runs to not-runs** (print dispatch over a set with no recorded atoms), so those fallbacks are
  reached. It stays until the print path's sets are covered.
- **`emitPrintValueUnion`.** It is lane G's box path (`emitUnionBoxOwed`).
- **`emitUnionUnionEq` ×2.** These feed lane A's `unionBoxEqColumns`.

## Proof

- **Sweep:** both sides on fixpoint seeds (base: this branch's merge base), 24,196 programs. 24,193
  were the same, with 3 bytes-only movers (D2823, D5310,
  `generics/generic-union-param-litunion-alias-arm.vl`). There were 0 output movers,
  0 `runs → not-runs` and 0 new compiler traps.
- **Gates:** fixpoint; `lint-self.sh` clean; `regress.vl` lost no runs;
  `check-filed-witnesses --strict` at 4,860 as filed.
- **Counts:** `unionNameOfExpr` call lines in `wasmEmit.vl` and `emit_fn_scans.vl` go from 16 to 11.

## Closing census 5, re-graded on master `68905c69` (2026-11-12 21:20)

**Cleared since the audit:**
- **H:** `nameFieldCode` is gone (#7625, #7643), and `fieldRowKind`, `objOrderStashSlot`,
  `sFieldStoreKind` and `fieldCodeCellKind` read no name. The `nulnone` half is #7650, and the
  type-parameter storage floor's contract is #7654.
- **F:** `rlRowOfNameMinted` is gone (#7621). The `rlKeyTyOf` and `rlElemStructRow` contracts are
  in #7636.
- **B:** `elemNameIsNominal` is gone (#7658), and `structRowOfAnnTyGo` reads no name.
  `rowCanonIdOfName` and `sRowsTwin` are closed by #7662.
- **D:** `isSName`'s mono caller is gone (#7660).
- `monoTagMapRepName`, `monoInstanceFor` and `letBindingUnionTy` read no name.
- **Pass (coordinator, 2026-11-12):** `spellingHasStructRow` and `isSName`, whose one caller is
  `pinKindOfName`, the `#anon` contract.

**Still failing, by lane:**

| lane | sites |
| --- | --- |
| B | `structRowOfSpelling` |
| E | `structElemArrayLowerable` and `internFuncTypeShapesTyGo` (`nameIs*` parses); `internShapeDeepOfTy` and `internArmShapeRow` (E3 renders) |
| F, or E's shape walk | `variantNestedRow`, `sFieldRefSlot`, and `armFieldStructRowMinted` |
| G | `unionNameOfCall`; `unionNameOfExpr`'s remaining callers, including lane I's three above |
| D | `monoArmsNarrowFrom`, `monoWideArmsHoldBrace` and `monoArmCount`, after G; `monoAnonRowListTy` and `monoElabCompositeTy`, after B; `monoArgTyNameProjected` and `monoPinAnnotatedParam` |

`armFieldStructRowMinted` is a correction to the earlier count: it is not dead. It is handed as a
function value (`armStructRowMintOn(armFieldStructRowMinted)`), which a call-line grep misses.

**Not step 7, open rows (coordinator, 2026-11-12):** D15809 (`emitIfExprRef`, w308) reads no name.
It is an open clause-2 row in the inventory queue.

**Assertions (ruled):** the four guards, `nulNicheIsTestImpossible` and `emitMapUnionPayloadTail`.
