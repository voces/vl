# IR-M1: a nullable rep node per inner type (D17075)

Lane IR-M1, 2026-11-23. Closes D17075.

## Mechanism

The arena does not hash-cons nullable types, so `type T = { v: i32, l: T | null, r: T | null }`
carries two `T | null` ids. A compare over `T` builds `l`'s id first: its nullable node is
provisional while `T`'s record builds `r`'s id as a second node, which interns. The first node
completes last, collides with that twin and is orphaned, yet `T`'s first kid still holds it, so a
typed `null` in `l` was built at a kid rep its type does not intern to (`record field null rep`).

`rtOfNullable` (emit_rep) now keeps one node per inner type in a tree generation (`rtNulByInner`,
reset in `rtSync`). A nullable node's discipline and inner rep are functions of the inner id within
a generation, so the reuse is exact. Legacy bytes are unchanged (ir-identity below).

## Readings

Base 714836837, head 47531f9e6, both fixpoint seeds.

- A/B (mode 1, tests/cases): covered 76,613 → 76,614, matched 76,613 → 76,614, start covered and
  matched 6,830 → 6,831, mismatch/fail 0 → 0.
- ir-only census (tests/cases run and trap tiers): 5,902 → 5,903 of 7,164 programs.
- `ir-identity.sh --cases`: identical 7,744, differ 0; `--claimless`: identical 14,054, differ 0;
  `--names`: differ 0; self-compile identical.
- Mode 6 prepost differs: corpus 0 of 82,251 rows, cases 1 of 66,690 (not own refusal 0).
- rep-fuzz exact; L2 self-compile fuel +0.02% on 121,924,301,435; `self ir misses` 0; deep nesting
  8 passed, 0 failed.
