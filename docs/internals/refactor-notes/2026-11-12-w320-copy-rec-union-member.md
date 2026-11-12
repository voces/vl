# The fresh-call copy builds a record field at the member of a union of records, 2026-11-12

Lane w320. Stacked on #7452 (D14385's lift). Check and emit.

**The defect (D15726).** A fresh call's record whose field is a record, delivered at a record
storing that field as a union of records (`{ r: Cir | Sq }`), was not a copy the rule admitted, so
D14385's interim refusal fired at the function's other call.

**The change.** `recUnionRecMember` (check_fit_rules.vl) names the one record member of the union
with the source record's field names, and `recCopyBoxesAt` admits the field when the copy's rule
admits the record into that member. `emitRecCopyIntoMember` (wasmEmit.vl) pushes the member's tag,
copies the record one level down at the member's row (`variantRowFields`), and builds the box,
as `emitStructExprAsVariantBox` does for a whole record. The path into the member restarts at it
(`|` in the copy path, read by `rcPathTy`) with `rcElemSrc`/`rcElemDst` set to the two records.

**Proof.** `kept-maker-delivery-record-union-member.matrix.vl` (new): 0 before, 122/125 graded, 3
owed; the 3 others are D15725 (filed here, master too): a held literal built at the destination
and read at its own type through the box. The union list-result template's guarded
`record_into_record_union` cell now runs (48/48 + 4 owed). Every kept-maker template is unchanged.
Fixture `kept-maker-record-copied-into-union-member-runs.vl`. Two members sharing field names stay
refused.

**Found on the way (D15727, clause 1, master too).** The sweep's one `runs → not-runs`
(`inferred-result-delivered-wider-runs.vl`) was a copied call whose own record is also an arm of a
row union with no annotated row: `copyArmRowOf` answered -1, so no copy was emitted. It now falls
back to the variant's own row; fixture `copied-call-record-also-row-union-arm-runs.vl`.
