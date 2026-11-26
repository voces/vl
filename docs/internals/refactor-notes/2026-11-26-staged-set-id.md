# IR: a function set's id staged below a valued `if` (lane COV-CLOS, 2026-11-26)

An operand written before a valued `if` among one node's operands is staged as a temp below the
`if` (`irBStageLeads`), typed by `stageTyOf`. A function set's id is an immediate at the id rep,
which the operand's checked type (a function type) does not name, so it had no staged type and the
node missed `staged literal type`. The temp is now typed at the id rep's own type (`repTyOf`),
which names that rep by construction.

## Measurements

I8 census over the `tests/cases` programs, the new position test among them (base and head at
master `903f71519`): `staged literal type` 3 → 0 (1 function, 2 start bodies). Claimed functions
97,865 → 97,866, claimed starts 8,434 → 8,436, claims fallen back 16 → 16; 0 claimed functions or
starts lost, no other class moved.

`VL_IR_REQUIRE_CLAIM=1 vl run` on
`tests/cases/closures/hole-fn-list-called-at-two-fn-types-choice-element.vl`: base fails (`staged
literal type`), head runs with every body claimed.

Q58 position sweep (`tests/cases/closures/hole-fn-set-id-staged-below-valued-if-positions.vl`: a
list literal walked, a list inside a function indexed): base 1 function and the start miss, head 0;
output identical claims-off and on. A call's arguments (`both(a2, if k { a3 } else { a2 })`, an
un-annotated callee) also stage the id, but hand the set to the tag decision late (a late tag row),
so the test leaves that position out.
