# A record read at its own type out of a union of records it was built into, 2026-11-12

Lane w320. Stacked on #7482 (row-union elements). Emit only.

**The defect (D15725, clause 2, master too).** A literal binding delivered at a record whose
field is a union of records (`{ j: Cir | Sq }`) is built there, so its `j` holds the union box. A
read `o.j.f` is typed at `o`'s own type, where `j` is a record, and the emitter found no struct
row for the receiver `o.j`: `field access receiver is not a struct`, and the same for a write.

**The change.** `boxedArmOfMember` (emit_classify.vl) names the variant of the one record member
with the read's field names (`recUnionRecMember`) where the receiver's row stores the field as a
box. Three readers agree on it: `structIndexOfMemberStore` answers the member's row, the field read
casts the box's payload to it (`emitMemStructRead`), and `exprUnion` answers no box, so a delivery
of `o.j` owes no unbox of its own.

**Proof.** `kept-maker-delivery-record-union-member.matrix.vl`: 122/125 before, now 125/125 + 3
owed. Every other kept-maker template unchanged. Fixture
`held-literal-read-through-record-union-field-runs.vl`: a string field, a write, one record down,
a call's result, and a list of the destination.
