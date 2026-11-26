## Codegen, memory & runtime (Track B)

- IR layout family, stage 2 (lane COV-START, coordinator ruling): an object literal's IR rep is the row legacy stores it at, and a function's result follows the row legacy declares it at, annotated or inferred; stage 1's two exclusions are gone, so makers returning nested literals around a function parameter are built at their rows, and a read off a stored row whose twin permutes its fields reads the row's own slot (6 start bodies and 2 functions newly built in tests/cases, none lost).
