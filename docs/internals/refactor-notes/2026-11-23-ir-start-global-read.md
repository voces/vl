# IR coverage: `start: global read coercion`, a union-box global narrowed to a smaller union (2026-11-23, lane IR-N8)

The IR-only census on master e6cb8541 ranks `start: global read coercion` at 29 start bodies in 29
programs, 23 of them the program's sole blocker. A probe tagging each miss with the cell's and the
read's reps sorted them:

| cell ← read | starts | here |
|---|---:|---|
| box ← record (a box narrowed to a record arm) | 12 | held, below |
| box/nullable ← box/nullable (a box narrowed to a smaller union) | 6 | **covered** |
| nullable ← nullable record niche | 2 | open |
| atom/str ← str/atom | 4 | M1's `rowFieldStorage` family |
| record ← record at another row | 3 | M1's `rowFieldStorage` family |
| i32 ← closure | 1 | open |

- **A smaller union:** legacy reads the global's box as it stands (arm `nonlocal`), as a box local's
  narrowed read stages it (`ba == "box"`). The global read is `globalBoxAt`, then the same `sgV`
  stage at the narrowed rep.

## Held: a box narrowed to a record arm

All 12 read the global inside `?? `'s field place (`v.r ?? 0` with `v` narrowed to `J`). Giving
the global read legacy's variant arm (`narrowedStructArmVi`, cast as a local's) moves 11 of them
to `start: coalesce field place` and 1 to `box ladder`, and no program it reaches is then fully
covered, so no witness can show its bytes match. It is left out until `coalesce field place`
lands.

## Measured

On the 29 programs, master e6cb8541's fixpoint seed against this branch: `start matched` 0 → 6,
`start: global read coercion` 29 → 24, one moved to `is arm tag box`.

Row: `tests/ir-shadow-rows/global-box-narrowed-sub-union.vl` (master: the start uncovered `global
read coercion`; branch: matched, the same output).

## Legacy tails the IR calls

None new.
