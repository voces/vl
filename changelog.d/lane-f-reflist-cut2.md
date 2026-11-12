## Type system (Track A)

- **A ref-list row that a nominal spelling names is keyed by its closed element type (step 7).** Annotation, pushed-shape, list-of-lists, map-value and nested-list mints hand over the type. A placeholder `i32[]` no longer mints a stray row for a `V[]` element, and those modules shrink (14 → 8 types in one).
