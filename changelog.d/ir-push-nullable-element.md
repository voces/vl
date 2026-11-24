## Codegen, memory & runtime (Track B)

- **IR coverage: a push onto a list whose element slot is nullable, byte-identical to legacy.** A `.push` into `(R | null)[]`, a nullable closure list or a generic `(T | null)[]` (std's idtable among them) appends the value as legacy builds it: at its own rep, that ref widened to its nullable, or a bare `null`. `push nested list element`, the sentence legacy's push plan gave every such slot, falls to 0; any other value is refused as `push nullable element coercion`.
