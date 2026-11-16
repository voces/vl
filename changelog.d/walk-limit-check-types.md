## Type system (Track A)

- Five checker type walks (`tyHasHole`, `tyHasNullHole`, `tyMentionsTyVarNamed`, `tyContainsList`, the annotation spelling `tyToTs`) visit each type once instead of stopping at a fixed depth; `tyHasHole`'s memo keeps one answer per type, which also lowers self-compile fuel.
