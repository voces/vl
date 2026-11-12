# Step 7: dead functions across `compiler/`, and the dead-export ratchet learns reachability, 2026-11-11

`2026-11-11-step7-classify-trim-1.md` found dead code in `emit_classify.vl` that neither
`unused-function` nor the dead-export ratchet saw. This PR runs the same scan over every
`compiler/*.vl` module, deletes what it finds, and adds the scan to `scripts/dead-exports.vl`
so the zero budget keeps the class caught. Base is master `7d0f985f`.

## Why the ratchet missed them

`dead-exports.vl` counted an export live when its name occurred anywhere besides its
declaration. Three things passed for a reference:

- a comment naming it (`objFieldCodeWidens`'s only other mention was a comment);
- an `import` list;
- a function that is itself dead. A private, mutually recursive pair, such as
  `blockEndsInSpill` with `ifArmEndsInSpill`, also slips past `unused-function`.

## The rule

A compiler/ function is **reached** when one of these names it:

- a mention outside `compiler/`, in std, tests, lsp, playground or scripts;
- compiler/ top-level code other than an `import` list;
- the body of a reached function.

Comments are stripped first. A function no root reaches is a `dead-export` finding: "reached only
from comments, `import` lists or dead functions". It counts in the same zero baseline, beside
the word-count arm, which still answers for exported `let`, `const` and `type`.

Validation:

- **Against a control that must fire:** on master's tree the rule lists 23 functions. An
  independent Python implementation lists the same 23, line for line.
- **The test:** `tests/vl_export_budget_test.ts` gains the reachability arm. A self-calling pair
  named only in a comment and an import list is reported, and a top-level call clears it. With
  the arm stubbed out, the test fails.

## What was deleted

All 23, in 13 modules, then a second wave of one: `fieldCodeWidensElem`, a private helper
whose only caller was `objFieldCodeWidens`. `unused-function` names it once its caller is gone.

| module | functions |
| --- | --- |
| `ast.vl` | `tsHasKind` |
| `check_calls.vl` | `slotAnnFnTyOf`, `calleeSlotHolderOf` |
| `check_fit_rules.vl` | `numOperandStamp` |
| `check_types.vl` | `tyEmitNameKey`, `emitKeyWrapped`, `emitKeyObj`, and their three state cells |
| `emit_atom_kinds.vl` | `declRowFnFieldFits`, `rowFnFieldFits`, `holeFnTyFieldFits`, `hfvSync`, and the five `hfv*` cells |
| `emit_elab.vl` | `elabCallBundleRet`, `elabJoinRoundsOf`, and its write-only counter |
| `emit_field_codes.vl` | `objFieldCodeWidens`, then `fieldCodeWidensElem` |
| `emit_fn_scans.vl` | `blockEndsInSpill`, `ifArmEndsInSpill` |
| `emit_obj_lit_fits.vl` | `declaredRefArrayName` |
| `emit_query.vl` | `blockHasValuedReturn`, `ifChainHasValuedReturn` |
| `emit_shape_rows.vl` | `rowFieldStoresAtom`, `tyStructHasMapField` |
| `emit_sig_tokens.vl` | `shapeNominalOr` |
| `emit_value_sites.vl` | `narrowedNulLitBoxKey` |

- **Comments:** each comment that cited a deleted function now states its own contract.
- **Imports:** the imports the deletions left unused are removed.
- **State lists:** the `emitKey*` rows leave `probe-map-classes.tsv` and the state audit's list.
- **Left alone:** `emit_classify.vl` is held for w314, so its one comment citing
  `declaredRefArrayName` is unchanged.

## Proof

Gates and the local sweep are in the PR.
