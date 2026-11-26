# IR: an annotated lambda's dispatch arm is called by name (lane COV-CLOS, 2026-11-26)

A tagged set's member that is a lambda (`xs.push((x: i32): i32 => x * 3)` beside un-annotated
functions) is dispatched by legacy at the instance the arm's row records (`emitArmRowFe`); where
monomorphization built none, legacy refuses only a generic lambda and calls any other by name. The
IR missed `tag dispatch lambda arm` on every lambda arm with no instance. It now misses only where
legacy refuses (`lambdaArmUnbuilt`: a generic lambda), and builds any other arm as its named call.

## Measurements

I8 census over the `tests/cases` programs, the new position test among them (base and head at
master `903f71519`): `tag dispatch lambda arm` 2 → 0 (2 start bodies). Claimed starts 8,433 → 8,435,
claimed functions 97,867 → 97,867, claims fallen back 16 → 16; 0 claimed functions or starts lost,
no other class moved.

`VL_IR_REQUIRE_CLAIM=1 vl run` on
`tests/cases/closures/annotated-lambda-pushed-into-hole-fn-list-dispatched.vl` and on the position
test: base fails (`tag dispatch lambda arm`), head runs with every body claimed.

Q58 position sweep (`tests/cases/closures/annotated-lambda-dispatch-arm-positions.vl`: an indexed
call printed, a walk summed, a dropped statement call, a capturing lambda inside a function, two
lambdas in one set): base misses at the start, head none; output identical claims-off and on.
