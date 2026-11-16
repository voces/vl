## Infrastructure (Track F)

- **D16558 narrowed:** a record type's field lookup by name reads a first-position name index once the type has more than eight fields, instead of scanning its names. An annotated 1,600-field record literal compiles in 1.66G guest fuel, from 4.41G (CPU 0.22 s from 0.62 s), output byte-identical over the corpus. The record literal's own scans remain, for a follow-up.
