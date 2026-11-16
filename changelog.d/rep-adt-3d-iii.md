## Infrastructure (Track F)

- **Rep ADT stage 3d-iii:** a field's element type is read off its storage type, except where it
  may hold a function, which is stored as its id (D16721). Two variant-twin fixtures reorder
  their type section at the same size and still run. Every other module is byte-identical. The
  literal-set sidecar is measured not to be a type projection: it records a layout decision.
  `docs/internals/refactor-notes/2026-11-16-rep-adt-stage3d-iii-elem-ty.md`.
