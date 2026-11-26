# IR: an annotated lambda's dispatch arm is called by name (lane COV-CLOS, 2026-11-26)

A tagged set's member that is a lambda (`xs.push((x: i32): i32 => x * 3)` beside un-annotated
functions) is dispatched by legacy at the instance the arm's row records (`emitArmRowFe`); where
monomorphization built none, legacy refuses only a generic lambda and calls any other by name. The
IR missed `tag dispatch lambda arm` on every lambda arm with no instance. It now misses only where
legacy refuses (`lambdaArmUnbuilt`: a generic lambda), and builds any other arm as its named call.

## Measurements

MEASUREMENTS_PLACEHOLDER
