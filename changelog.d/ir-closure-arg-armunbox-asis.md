## Codegen, memory & runtime (Track B)

- **IR: a closure-call argument already of its union-arm parameter's arm:** a closure call into a union-arm parameter whose argument already is that arm now builds in the IR and is written as it stands, by the plan legacy dispatches on (`callRefArmUnboxPlan`). Byte-identical; `call of a non-declaration` falls from 52 to 37 on `tests/cases` and from 7 to 3 in the corpus.
