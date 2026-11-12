# A record copied into a union of records picks among members sharing its field names, 2026-11-12

Lane w320. Stacked on #7506 (D15725). Check and emit.

**The defect (D15892).** The copy builds a record delivered at a union of records at the one
member with its field names (`recUnionRecMember`). Two members sharing them (`{ x: i32 } |
{ x: string }`) left none, so the copy did not convert and D14385's interim refusal fired.

**The change.** Among the members with the record's field names, `recUnionRecMember` takes the
one storing the record as it is (`fieldStorageEq`), else the one the copy's rule admits it into,
bounded by the copy's depth; two admitting and neither exact still answer -1. The copy's gate,
the copy's emitter and the held read (`boxedArmOfMember`) all call it, so they pick the same
member.

**Proof.** `kept-maker-delivery-record-union-shared-names.matrix.vl` (new): 0 before, 125/125 + 3
owed. Every other kept-maker template unchanged. Fixture
`record-copied-into-union-member-sharing-field-names-runs.vl`.
