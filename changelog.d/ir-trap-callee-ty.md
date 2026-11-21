## Codegen, memory & runtime (Track B)

- **IR coverage, operator calls through a closure field:** `o[k]`, `o[k] = v` and `a * s` over an
  object whose `"[]"`, `"[]="` or operator field is a closure build through the IR. The callee the
  emit rewrite mints for them is now typed at that field's type. No emitted byte moves.
