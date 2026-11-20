## Codegen, memory & runtime (Track B)

- **IR: a container of a tagged function set's members:** a record, list or map whose only open type parts are function types, held at a rep with no closure, is built by the IR: those functions are the set's `i32` ids, so the verifier's rule-1 test (`irTyHeldOpen`) holds the container as it holds a lone member; 267 more corpus functions are built by the IR.
