## Codegen, memory & runtime (Track B)

- **IR coverage, a `.push` into a narrowed list arm:** a push receiver that unboxes a list arm out of a union (a narrowed binding, field, element or nested field) is read with legacy's strict payload cast (`listCastForPush`, D4949), held only while each of the receiver's own temps is written. Corpus and tests/cases `push receiver payload cast` 8 functions and 8 starts → 0; covered = matched.
