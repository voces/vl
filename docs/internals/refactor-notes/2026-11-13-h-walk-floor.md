# 2026-11-13 — lane H: the canon walk's label render is a D16052 floor

`canonUnionMembersWalk` (check_program) renders each member with
`canonEmitNameAt(tyToNominalName(lt), ctx)`. Since A's #7858 the dedupe compares member types
(`memberTySame`), so the render only labels the returned `atoms`. That label column is what
D16052 retires.

- `scripts/render-parse-floors.txt` lists the walk site under D16052, so the census counts it as
  `ty-carried-floor`.
- The walk rule now says how the site is graded. The census counts the site while the walk calls
  `canonEmitNameAt`; whether a decision reads the render is graded by hand, and a label no
  decision reads is a floor.

One render-read guard remains in the walk: `if nom == "" { return false }` fails a member that
has no nominal render. Its owner is with A.

Budget: check_program `ty-string-parse` 1 → 0 and `ty-carried-floor` 0 → 1 (totals 3 → 2 and
4 → 5). Two entries drifted on master (an `emit_start_block` and a `wasmEmit` text) and are left
as master has them.
