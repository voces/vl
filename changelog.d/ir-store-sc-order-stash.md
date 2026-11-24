## Codegen, memory & runtime (Track B)

- **IR: a store whose value is a record literal written out of its row's order, holding a boxed binding's `??`, builds in the IR**: the literal's order stash sets its fields below the staged receiver and key, as the staging `??` does. tests/cases map and field store short-circuit functions of that shape build, byte-identical to legacy.
