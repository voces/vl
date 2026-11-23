## Codegen, memory & runtime (Track B)

- **IR coverage, narrowed fields and intersection fields:** a narrowed field read at a boxed-nullable storage, and a field of an intersection or alias type found by its record's own field order, build through the IR byte-identical to legacy. Corpus +16 covered = matched; fully IR-only programs 5,689 → 5,701.
