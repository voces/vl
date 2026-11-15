## Type system (Track A)

- **Design: `substTyDeep` without a mode** (review medium 3, stage C,
  `refactor-notes/2026-11-15-subst-pure-design.md`). A dynamic census found 82 writers that run
  under a substitution, out of 176 reachable. No hole pin and no in-place fill runs there. Only
  three products depend on `inferQuiet`: the elaboration's pin notes, field-annotation types and a
  lint note. The design pre-banks the last two at the declaration and makes the pin notes a
  `CheckRun` family, after which two quiet brackets and the substitution memo's mode key go. Docs
  only.
