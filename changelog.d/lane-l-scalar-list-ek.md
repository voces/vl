## Codegen, memory & runtime (Track B)

- **Refactor (no behaviour change):** a scalar list's indexed store and `.push` read one element kind from the list's rep rather than three per-kind flags, and dispatch through the helpers that already take an element kind. Generated code is byte-identical on 347 list fixtures. This is the groundwork for a `v128` list kind.
