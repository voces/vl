## Infrastructure (Track F)

- **Rep ADT stage 3c-iii:** `nameFieldCodeTy`, which codes declared, shape and union row fields,
  derives the code from the field type's rep. The type ladder under it is deleted (−251 compiler
  lines), with 0 module bytes changed on either corpus. Answering a record by shape stays,
  because asking the rep for it too early fixes a record that is still to become a union arm:
  `docs/internals/refactor-notes/2026-11-16-rep-adt-stage3c-iii-name-ladder.md`.
