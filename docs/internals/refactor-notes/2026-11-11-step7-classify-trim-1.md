# Step 7: dead and single-caller helpers in `emit_classify.vl`, first trim, 2026-11-11

The scoreboard's "emit_classify ↓" is not met: the file grew from 14,412 to 14,568 lines across
the step-7 conversions (`2026-11-11-step7-closing-census-2.md`). This trim deletes what those
conversions left dead, and inlines single-caller one-line aliases. Base is master `82eca538`.

## How the candidates were found

A scratch scan reads every `compiler/*.vl` file with comments stripped, and records which
function each name is mentioned in. A function is dead when none of its mentions is in a live
function or in top-level code other than an import or export list, applied until nothing changes.
That catches what the unused-function lint cannot see across modules: an exported function
whose only importer never calls it, and a cluster that only calls itself.

On `emit_classify.vl`'s 620 functions it finds 4. One is a false positive:
`fnRecordedRetTyUnset` is stored as a function value (`fnRecordedRetTyFn`), which the scan's
body span missed.

## What changed

| function | was | now |
| --- | --- | --- |
| `letIsVariant` | exported; no caller anywhere | deleted |
| `variantIndexOfLet` | exported; its one caller was `letIsVariant` | deleted |
| `letRefListElemName` | exported; named only in `classifier-census.vl`'s `NOT_BLIND` list | deleted, and its list entry with it |
| `readIsLoopBox` | a one-line alias with one caller | inlined into `letInitIsBox` |
| `fieldClosureFeOf` | a one-line alias with one caller | inlined into its caller as `fieldClosureFeOfWant(…, -1)` |
| `fieldReadIsNulLitAtom` | a one-line alias with one caller | inlined into `exprNulLitUnion`'s `Member` arm |

`emit_classify.vl`: **14,557 → 14,511 lines (−46)**, and 620 → 614 functions.

## What the scan says is left

The scan finds no other dead function in the file. What remains is named helpers:

- **29 short functions with one caller.** Most carry a contract comment. Inlining one saves
  about five lines and loses a name the comment documents, so they are left.
- **About a dozen one-expression forwarders with several callers.** These are mostly a
  depth-0 entry to an `…At` walker, such as `arrElemLitUnionTy` and `nulLitAtomTexts`. They are
  the walker's API, not debt.

The file's growth came from real conversions, not from dead code: a type read added where a
name read was, and an invariant `emitFail` added where a silent default was. "emit_classify ↓"
will not reach its old line count from deletions alone.

## Proof

- **Gates:** each exits 0.
  - refresh, lint-self + fmt, `ladder-sets`;
  - rep-fuzz: exact;
  - the dead-export and render-parse budgets; seed-size is +0.4%;
  - probe-rollback, and `cases_wasm`: 7,441 passed, 0 failed;
  - distilled `regress.vl`: no runs lost.
- **Local sweep:** fixpoint seeds, base against head, below.
