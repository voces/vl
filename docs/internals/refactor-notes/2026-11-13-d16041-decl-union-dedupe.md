# D16041 — a declared union's equal anonymous record arms are one member (2026-11-13)

`type R = { v: i32 } | { v: i32 }` passed `vl check` and the emitter refused it. The emitter
interned `R` as one struct row, through `unionDeclStructAlias`. The checker kept a `TyUnion` of
two `tyEq` members at different arena slots (probe on `0a58b213d`: `union n=2 m=332 m=333 eq Rrows=1`).
The inline spelling dedupes those arms (`pushDistinctVariantTy`); the declaration route copied
its survivors verbatim.

## The change

`unionDeclFillMembers` (`check_relate_core.vl`) pushes each survivor through
`pushDistinctAnonRecord`. An anonymous record arm, meaning one with no struct, brand or
generic-application name, drops when an equal anonymous arm is already there.

## The refused version: the inline route's predicate

`pushDistinctVariantTy` also folds equal NAMED records. That lost three programs that run on
master: `type R = A | A`, `A | B` over equal `A` and `B`, and `A | { v: i32 }`. Each now read
"field access but no struct type declared". The emitter treats `A` as a variant arm by its
spelling (`declIsVariantArm`), so `collectS` mints no row for it, and a one-member union mints none
in `collectU` either. Only the arms the emitter's alias rule already folds are deduplicated.

## Measured

| program | master | this branch |
| --- | --- | --- |
| field read on `R` | emit reject | `7` |
| read through a parameter `r: R` | emit reject | `7` |
| `if r is { v: i32 }` | emit reject | `7` |
| `R` passed to a `{ v: i32 }` parameter | emit reject | `7` |
| `{ k: "x" } \| { k: "x" }` field read | emit reject | `x` |
| `A \| A`, `A \| B`, `A \| { v: i32 }`, `A \| A \| C` | `7` | `7` |
| `match r { { v: i32 } => … }` on `R` | check-clean, emit reject | check reject, as the inline and single-record forms |

Control: `tests/cases/unions/declared-identical-record-arms.vl` fails on master and runs here.
