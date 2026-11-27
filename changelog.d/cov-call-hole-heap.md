## Codegen, memory & runtime (Track B)

- **IR:** a record with an open closure field stands on the heap of the record that fills it (`convert list -> list`, `convert closure -> closure`: d15293, generic-fn-param-in-un-annotated-container).
