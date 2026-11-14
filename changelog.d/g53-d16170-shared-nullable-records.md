## Codegen, memory & runtime (Track B)

- **D16170 closed:** a field read over a union of records whose members store the field as
  nullable records of different types builds and runs, boxed as the records or `null`.
