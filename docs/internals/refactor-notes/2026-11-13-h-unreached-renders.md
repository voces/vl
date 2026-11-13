# Step 7, lane H: three unreached renders floored, 2026-11-13

Lane I's triage named three type-to-name renders that no corpus program reaches.
Each one now fails loudly or is deleted, as in #7759.

| render                                             | what it rendered                                       | now                                                                                       |
| -------------------------------------------------- | ------------------------------------------------------ | ----------------------------------------------------------------------------------------- |
| `arrLitElemName`, frame-typed path (emit_classify) | `rlRowNameOfTy(tyArrayElemIx(ft))`                     | a loud floor; the frame row is collected by `collectFrameRefRow`, not named here          |
| `memReadBoxNarrowName` (emit_classify)             | `unionSpellingOfTy(nt, 8)` of the narrowed box's union | deleted; its one `??` caller floors when `memReadBoxNarrowTy` answers, else reads `mphys` |
| `fieldTypeRefusalMsg` (emit_shape_rows)            | `tyToNominalName(arm)` or the field's spelling         | deleted; its four refusal sites carry the general sentence                                |

## Probe and control

A throwaway compiler counted each site over the sweep list (24,217 programs,
`vl check --batch --codegen`, refusing programs counted too):

| site                                            | hits   |
| ----------------------------------------------- | ------ |
| `arrLitElemName` entry (control)                | 1,028  |
| `arrLitElemName`, `ft >= 0`                     | 0      |
| `memReadBoxNarrowName` entry (control)          | 319    |
| `memReadBoxNarrowName`, `nt >= 0`               | 0      |
| `fieldTypeRefusalMsg` entry                     | 0      |
| `collectS` entry (control for its refusal site) | 19,152 |
| `collectShapeVariantFields` entry (control)     | 795    |
| `collectVariantFields` entry (control)          | 4,064  |
| `internShapeAs` entry (control)                 | 48     |

The struct-field refusal (D734's sentence) fires nowhere: every field that
reaches the four sites has a field code. The fixtures that quoted it do so in
history comments only.

## Measurement

- **Sweep** (`sweep.vl diff`, fixpoint seeds, master bf693a80e against this):
  24,218 programs, all the same. 0 bytes-only movers, 0 output movers.
- **Census:** three `ty-render` sites go: emit_classify 5 → 3, emit_shape_rows
  10 → 9.
