## Codegen, memory & runtime (Track B)

- **D16161 closed:** a map whose value is a list of records holding un-annotated functions that nothing calls builds, taking each function's default instance as a map of the bare records does. `m["k"] = [{ f: inc0 }]; print(m.has("k"))` prints `true`; it was a check-clean `unsupported map value type`. D16162, a record nested in the map's value, is filed.
