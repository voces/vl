## Codegen, memory & runtime (Track B)

- **IR coverage: a field read off an element narrowed through its index place.** `if xs[0] is A { xs[0].r }`, and a map index place the same way, now builds in the IR as legacy's `emitNarrowedMem` writes it: the element re-read at its storage box, then the narrowed arm's field. Family B1 of `member record`: its 15 functions and 3 starts match. Legacy's bytes don't change.
