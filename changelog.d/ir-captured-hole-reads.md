## Codegen, memory & runtime (Track B)

- **IR: a captured hole-lambda binding, and a captured cell of hole lambdas, are read**: the binding at its open type's uniform closure, and the cell at its capture's list, where legacy's capture and cell agree. tests/cases `rep ?` rows 66 → 55 and `capture binding` 139 → 130; +35 claimed functions over the five I8 populations. Byte-identical.
