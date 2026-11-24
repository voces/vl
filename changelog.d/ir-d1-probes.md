## Codegen, memory & runtime (Track B)

- **IR builds `===` and `!==` over references as legacy does** (capability probe `identity-eq-record`). A record, list or union compared by identity is each operand, a union box by its payload, then `ref.eq`. A read narrowed out of a union's storage, which legacy still reads as the box, is a named miss. Byte-identical; keyed self-tests refuse a string or `i32` operand.
