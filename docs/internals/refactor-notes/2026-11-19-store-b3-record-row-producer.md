# STORE B3 record-row producer, step 1: `ftOpenFieldHolds` at check (2026-11-19)

Finding (ii) of the 2026-11-18 lambda-leaf design note named this producer: decide every set that
shares a record row together at check, or none of them.

## Mechanism
`ftOpenFieldHolds` runs in the check's retry (`ftUseArrow`) as well as after the elaboration. At
check it also consults `ftShapeFieldDecidedWith`, which applies two rules to every other record
literal with the same field names (`ftShapeLitsOf`, indexed once per decision):
- **A set at that field:** it is pushed onto `ftSubNeed`, so it is decided with `s`. If any of them
  fails to plan, the whole group stays undecided.
- **An open field** (a type variable, bound per instance): refuses at check, so the late pass
  decides the row's sets together.

## Measured (master 804aa1262 fixpoint vs this branch's fixpoint)
- Running `ftOpenFieldHolds` at check without the shape rule moves 4 rows and breaks
  `functions/named-function-record-beside-hole-handed-two-functions.vl` (validation in `both$1`),
  the D15641 coupling.
- Refusing on any other undecided set (instead of deciding it with `s`) moves none.
- With the rule:
  - Late tag rows: 3 gone, 0 new. All are in
    `functions/set-of-boolean-fns-in-record-handed-to-hole-callee`: T {pos,big}, T {pos,odd},
    T {pos,odd,neg}.
  - `named-function-record-beside-hole-handed-two-functions` P {idf} stays late: `hand1`'s
    `{ f: g }` has an open field. It is also the grading cell for the coupling, and it runs.
  - `VL_LATE_DEMANDS=1 vl check --codegen tests`: diagnostics byte-identical.
  - Full @run A/B: see the PR.

## Next in this stage
- D15923: an outer literal whose field is a named call's result holding the set's records.
- D16998's lambda spelling: a `const` lambda record pushed into a list of a tagged set, built at
  the push's closed type.
Both are rows of the same coupling, from the holder side.
