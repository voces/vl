## Codegen, memory & runtime (Track B)

- **Slot store:** the place classes are frozen when mono begins, built first where a program takes a function as a value and frozen empty where it takes none; rebuilding them or marking them stale after that is an internal emit error (D16768).
