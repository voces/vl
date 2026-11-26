## Codegen, memory & runtime (Track B)

- IR layout family, stage 2 (lane COV-START, coordinator ruling): an object literal's IR rep is the row legacy stores it at, and a function's result follows the row legacy declares it at, annotated or inferred; stage 1's two exclusions are gone, so makers returning nested literals around a function parameter are built at their rows.
