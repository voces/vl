## Type system (Track A)

- **Design: a pure `relate` and one recorder** (engineering review medium 3,
  `refactor-notes/2026-11-15-relate-recorder-design.md`). It is a census of `assignableExpr`: 82
  call sites, of which 53 only ask whether a value fits, and 52 recorders in eight effect kinds
  among the seam's 105 callees. It proposes the `Fit = Coercion | Mismatch | Refused` value and a
  byte-identical migration of four effect-kind PRs and then five caller-family PRs. The migration
  deletes 14 of the 20 `inferQuiet` quiet brackets. Docs only.
