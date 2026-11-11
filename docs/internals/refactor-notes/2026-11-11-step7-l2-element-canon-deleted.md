# Step 7 L2 §7: the element canon is the identity, and is deleted (render-parse 70 → 65), 2026-11-11

The brief was to pass element, value and field types through `rlCanonLitUnionAtoms` and
`canonLitUnionArms`, so that each level asks the type. The measurement below says not to: the
descent never changes its input. This PR deletes it. Base is master `ada32709`, with a fixpoint seed
of 6,615,486 bytes. The population is the sweep's 23,882 programs.

## Measured

The probes were `emitFail` markers at the two entries, `mvCanonValNameTy` and `rlElemStoredName`.
Each fired when the result differed from the input name. There was one compiler per probe, each
built into scratch by the base seed, and the counts are **programs**. A third probe fired on any call
with no type. It reached 3,369 programs, which shows the entries are live.

| probe | reached |
| --- | --- |
| result ≠ input, caller holds a type | 3: `D9715`, `hole-fn-list-map-value-tagged.vl`, `hole-fn-nested-list-map-value.vl`, all through `fnTagListRepName` (a type read, kept) |
| result ≠ input, no type | 0 |

The literal-union descent was a softening rule once. Under the preserve ruling it keeps every
alias atom, and what is left is a grouping-paren normaliser. Its input is a render or a parsed
annotation, which already has canonical grouping, so it never fires. Three hand-written programs
check this. They spell redundant grouping (`((S))[]`, `((K | i32))[]`, `{[string]: (K | i32)}`,
`({ k: (K | i32) })[]`), and each builds byte-identical wasm on base and candidate.

## Changed

- `rlCanonLitUnionAtoms`, `canonLitUnionArms` and `canonAtomsOfTy` are deleted.
- `mvCanonValNameTy(valName, ty)` is `fnTagListRepName(ty)`, else the spelling.
- `rlElemStoredName(name)` is the spelling, with the i32-backed and string lists folded to their
  wrapper names. It drops its unused type parameter.
- Seven imports have no remaining use and are removed.
- Six test-case comments that named the deleted functions as what they pin now say what the
  cell still pins.

`mvSlotOfValNameFindK` still calls `mvCanonValNameTy(valNameIn, -1)`. That entry is w309's. It now
answers the spelling unchanged.

## Proof

- Refresh ×2 is a fixpoint at 6,612,737 bytes (−2,749).
- `sweep.vl diff` from base to candidate: **23,882 same**, 0 bytes-only movers, 0 output movers, 0
  `runs → not-runs`, 0 new compiler traps.
- The render-parse ratchet goes from 70 to 65 parses (38 renders unchanged), with `--write-baseline`
  in this PR. The cut is five parses: three `isTopLevelFuncTypeName`, one `mapValNameOf` and one
  `nameIsLitUnionType`.
- `scripts/gate.sh`: all 23 rows pass. These include lint-self and fmt, seed size, late demands,
  plumb-shape cost, the kind-ladder, dead-export and render-parse budgets, rep-fuzz, the filed
  witnesses, the capability probes and the distilled corpus.
