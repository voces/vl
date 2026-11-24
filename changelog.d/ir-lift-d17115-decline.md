## Codegen, memory & runtime (Track B)

- **IR coverage:** a value `if` whose arm is a union narrowed to a record, passed straight to a record parameter, is built by the IR now that legacy writes it as the record (D17115).
