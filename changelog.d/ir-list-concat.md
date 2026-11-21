## Codegen, memory & runtime (Track B)

- **IR coverage: list `+`.** A list concat missed at `operand type`. It now builds as `RListCat`: its operands, each operand's recovery (`listCatOperandTail`), then legacy's concat tail (`listCatTail`), at every list rep legacy concatenates without widening. Legacy's i32-list and rep-parameterised concat writers now share that one tail and one route (`listCatRouteOf`). An operand widened into the concat's rep first is a named miss (`list concat widen`).
