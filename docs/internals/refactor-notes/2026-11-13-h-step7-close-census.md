# 2026-11-13 — lane H: the render-parse census at the step-7 close

This regenerates the census on master `11274d920`, after B's #7881 filed D16014. The seed is a
fixpoint, reached on the second refresh (`e5c1031f0864bebe`). The origins probe
(`scripts/render-parse-origins.ts --jobs 3`) covered 24,243 programs.

## The count

| code | sites | what they are |
| --- | --- | --- |
| `ty-string-parse` | **0** | a type-string parse of a render or synthesized name |
| `ty-parse-unclassified` | **0** | a parse no probe graded |
| `ty-carried-floor` | 7 | the sites a filed row carries past step 7 |
| `ty-source-parse` | 3 | `nameIsQuotedLeaf` over a literal's own lexeme, source by construction |
| `ty-render` | 93 | a render a later decision reads |
| `ty-render-display` | 42 | a render for a message |

The carried floors, from `scripts/render-parse-floors.txt`:

| row | site |
| --- | --- |
| D16022 | emit_mono `monoArgTyNameRep` `arrElemSuffixed`, `nameToTy` |
| D16032 | emit_collect `arenaEmitName` `canonEmitNameOfTy` |
| D16052 | emit_union_registry `msFreeSliceOfTy` `canonUnionMembersLitsInto`; check_program `canonUnionMembersWalk` `canonEmitNameAt` (the label column; its other read of the render is the presence test `nom == ""`) |
| D16014 | emit_rep `repElemTyOfName` `resolveAnnot`, `declTyIxOfName` `resolveAnnot` |

## What moved in the regeneration

- `render-parse-origins.txt` drops 11 rows whose sites no longer exist. These are the canon walk
  callers A converted, the `valueAtomKind` and `unionHasBoolLeafArm` sites E and G converted, and
  the box narrow and retag sites. No surviving site changes grade.
- `render-parse-sites.md` is regenerated from the same probe.
- In the budget, wasmEmit `ty-parse-unclassified` goes 5 → 0 (G's unreached `valueAtomKind` sites
  are gone). An `emit_start_block` entry's text is updated to its current line.

`ty-render` (93) and `ty-render-display` (42) are renders, not render-parse pairs; step 7 ruled
on the parse side.
