## Codegen, memory & runtime (Track B)

- **D16724 closed:** a record literal built beside a closure-written captured copy of a type parameter no longer costs about cubically in its fields (32 fields: 19.7M guest fuel, was 76.5G); slot store part E (#8806) removed the walk. A scaling-shape growth axis (32 fields against 8, 1.83 today) guards it.
