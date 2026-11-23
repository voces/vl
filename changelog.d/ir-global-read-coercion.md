## Codegen, memory & runtime (Track B)

- **IR coverage:** a module global holding a union of records, read where the checker narrowed it to one record (after a reassignment to that record, or an `is` test), is read as that record, as a local is.
