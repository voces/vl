# Step 7 P5: the list-literal mint keys its row by its rung's type, 2026-11-13

`collectAArrayLit` mints a list literal's ref-list row with `rlInternNameTyK`. With no closed
element hint (`arrLitMintHintTy` is -1 by design for a literal or record element, D15770), the
row's key and stored type came from re-parsing the stored name: `repElemIdOfNameTy(name, -1)`
and `fieldElemTyIxOfName`.

## Graded

Every probe reset its marks per compiled program; each swept 24,209 programs.

1. **Generic candidates fail.** The literal's rep element, its node-type element, its rep stamp
   and its nominal row each disagree with the name parse in many programs. The build type
   `kindTy` gives a different key in 153 of 387.
2. **So the grading is per rung.** Every hint-less mint takes its name from the template ladder
   `arrLitElemNameTpl`. `arrLitElemKeyTy` mirrors that ladder rung for rung and answers the type
   each rung builds its name from. The probe compared that type's key and type with the parse's:

| rung | name built from | programs | decision |
| --- | --- | --- | --- |
| P2 | a union element's render | 8 | type, all agree |
| P7 | a nested list's scalar leaf row | 50 | `mkArrayTy` of the row's scalar, all agree |
| P9 | a nullable object element | 28 | the element type, all agree |
| P11 | an arm's variant row | 121 | `uVarTyIx`, all agree |
| P13 | the element's committed annotation | 36 | the annotation's type, all agree |
| P14 | a map element's stored type | 48 | `mapStoredTyOf`, all agree |
| P15 | a declared nominal element | 14 (31 more are names that never parse) | the declared type, all agree |
| P10 | `sNames[si]`, a struct row's handle | 212 | keeps the name: the handle contract, a floor |
| P1 | the closure render | 10 of 114 differ | keeps the name: D16013 |
| P16 | the nested-list render | 1 of 10 differs | keeps the name: D16013 |
| P17 | the nullable element render | 1 of 54 differs | keeps the name: D16013 |
| P3–P6, P8, P12, outer rungs | — | not reached at a hint-less mint | keep the name |

The three D16013 rungs render a normalized type. The render widens a literal (`() => "ab"`
becomes `(()=>string)`) and unifies nullable forms, so the parse is a different type with a
different key. They keep the name until that normalization has a typed form.

## Change

- `arrLitElemKeyTy` (emit_classify) is the typed twin, answering -1 at every kept rung.
- `collectAArrayLit` passes its answer as the mint's key hint when `arrLitMintHintTy` gives none.
- At the seven converted rungs the key, the stored row type and the stored name's fold all read
  that type, and no name is parsed.

## Measured

| instrument | result |
| --- | --- |
| full sweep, 24,219 programs, base bf693a80e against this change on it, both fixpoint seeds | 24,219 same; 0 bytes-only movers; 0 runs → not-runs; 0 new traps |
| fast set on the same tree | all green |
