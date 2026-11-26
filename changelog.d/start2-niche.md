## Codegen, memory & runtime (Track B)

- **IR claims a field or element read narrowed out of a union box to its `T | null` niche:** the place is read at its storage (the box) and converted through the niche tail, as legacy's `emitNarrowedNicheRead` writes it, and the field lowering takes such a read's shape at its storage too. `pre-path niche read` falls 7 → 0 on its programs, bytes identical claims-off.
