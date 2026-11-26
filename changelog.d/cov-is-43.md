## Codegen, memory & runtime (Track B)

- **IR builder:** a value with no recorded box union, such as a record literal's field stored into a map whose value row is widened later, is boxed into its destination rep's union instead of missing.
