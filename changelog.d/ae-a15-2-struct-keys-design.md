## Type system (Track A)

- **A15.2 design note for a ruling:** `docs/internals/a15-2-struct-keys-design.md` sets out struct keys for `Map`/`Set` as seven questions with options and a recommendation each: eligibility, float sameness and mutation after insertion (ruled 2026-09-01, to reconfirm), and width, user hashing, iteration order and union keys (open). No code until ruled. Files D16688 (a refused key type cascades into `array index must be i32`).
