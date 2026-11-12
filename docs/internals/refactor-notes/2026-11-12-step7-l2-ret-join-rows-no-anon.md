# Step 7 L2 §7: a return-join row is never named by an `#anon` handle, 2026-11-12

#7381 named the return-join and recorded-union rows by the naming rule (`monoPinSpellShaped`).
That rule spells a record by its row's name, and an anonymous row's name is an `#anon` handle.
So a row could be named `#anon0[]|i32[]`. #7389 then lost a program once it handed that name to
a reader that parses the record back. `monoPinSpellNoAnon` (`pin_spell.vl`) spells a record
whose row is an `#anon` handle by its fields, at any depth. `registerRetJoinUnions` and
`retFlagsSeedResult` name their rows by it, so neither puts an `#anon` handle into the registry.
`monoPinSpellOf`, `monoPinSpellShaped` and `monoPinSpellFields` are unchanged.

The base is #7389's head, with a fixpoint seed on both sides. The population is the whole sweep,
23,972 programs.

## Probe

At both sites, a probe tagged a name holding `#anon`. Of the 33 test programs that reach them,
none now produces one. Under #7381's naming they did, for example `#anon0[]|i32[]`.

## The readers that take a row's name as a spelling

These are the remaining L6 readers. There are 31 reads of `unNames[row]` in `compiler/`. Four are
the registry's own diagnostics (`unKeySweepPair`, and `unionRegistryABSweep` three times), and two
put the name into an `assignTags` refusal. The other 25 hand it on as a spelling:

| file | readers |
| --- | --- |
| `emit_anon_fields.vl` | `regUnionNameGo` (3) |
| `emit_classify.vl` | `rlUnionNameOfTy`, `capturedUnionName`, `unionNameOfHoleRead`, `letNulScalarBoxName`, `unionNameOfExpr`, `callUnionNameOfTy`, `nestedUnionRowName` |
| `emit_collect.vl` | `collectMapFilterUse`, `mfInternPinRows` |
| `emit_mono.vl` | `monoClosedTyName` |
| `emit_obj_lit_fits.vl` | `sharedFieldStructBoxName` |
| `emit_sections.vl` | `emitConstCellInit` |
| `emit_start_block.vl` | `registeredUnionNameOfTy` (2), `nulValueUnionBoxRowName` |
| `emit_union_atoms.vl` | `mvShapeOfValNameArmTyGo` (2), `unionNameOfVariant` |
| `emit_union_registry.vl` | `rlElemUnionName`, `unionRowNameAB` |
| `wasmEmit.vl` | `boxRecordNameOf`, `emitUnionUnionEq` |

## Proof

- **Local full sweep.** `--prove-fixpoint` seeds on both sides: 23,972 same, 0 bytes-only
  movers, 0 output movers, 0 runs → not-runs, 0 new compiler traps.
- **Checks.** Listed in the PR. The render-parse baseline is not written here; render-parse is
  flat.
