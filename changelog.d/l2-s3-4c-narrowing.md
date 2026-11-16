## Type system (Track A)

- **A discriminant test on an un-annotated or generic parameter's field narrows the field's
  parent at each call** (L2 S3.4c, `refactor-notes/2026-11-16-l2-s3-4c-discriminant.md`; D12602).
  `if z.h.k == "a" { z.h.v } else { z.h.s }` over `{ h: A | B }` was refused as a field not on every
  member. It now runs, as the test does on a declared union.
