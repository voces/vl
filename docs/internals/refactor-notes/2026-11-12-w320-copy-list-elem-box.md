# The fresh-call copy boxes a scalar list's elements into a `| null` or union element, 2026-11-12

Lane w320. Stacked on #7463 (record into a union member). Check and emit.

**The defects.** A fresh call's record holding `i32[]`, delivered at a record storing that list as
a list of union boxes, was not a copy the rule admitted. At `(i32 | null)[]` nothing converted and
the module was invalid ([D15728](../inventory/D15728.md), clause 1, master too); at
`(i32 | string)[]` D14385's interim refusal fired ([D15729](../inventory/D15729.md)).

**The change.** `recListElemCopies` (check_fit_rules.vl) admits a scalar element into a `| null`
holding it or a number it widens to, or into a union listing it. `emitListConvTop` (wasmEmit.vl)
boxes each element with the spread's `emitScalarListBoxTop`, under the atom `rcListBoxAtom` names,
where the destination has a union-box row (`(string | null)[]` stores a string list as it is). Its
two temps are keyed by `rcLoopDepth` now, so a list inside a copied record list boxes on its own pair.

**Proof.** `kept-maker-delivery-list-elem-nullable.matrix.vl`: 59 SILENT cells before, now 122/122
graded + 6 owed. `kept-maker-delivery-list-elem-union.matrix.vl`: 0 before, 122/122 + 6 owed.
The union list-result template's guarded `list_into_union_list` cell runs (50/50 + 2 owed); its
`row_union_elements` cell, D14385's witness, stays owed. Every other kept-maker template unchanged.
Fixture `kept-maker-list-elements-boxed-at-wider-row-runs.vl`.
