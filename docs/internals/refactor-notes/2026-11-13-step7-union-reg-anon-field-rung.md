# Step 7 L6 (lane G, cut 7b): an anonymous field's union box names no row by spelling, 2026-11-13

This cut is stacked on cut 7a (#7704). `regUnionNameGo` (emit_anon_fields) names the union box an
anonymous record field registers under: its row by type key, else the row its widened spelling
(`unionSpellingOfTy`) was bound to, through `unRowOfName`.

## The census

A probe compiler, built in the scratchpad and never refreshed into a seed, ran over the sweep list
(24,170 programs). It recorded every call that reached the spelling rung, and whether the
literal-widened type (`widenLitTy`) keys a row there.

| calls reaching the spelling rung | the spelling names a row | the widened type keys a row |
| --- | --- | --- |
| 920 | 0 | 0 |

Every call is a type that keys no row, such as `string|null`, `i32[]|null` or `(()=>i64)|null`,
whose spelling no row is bound to either.

## Changed

The rung is deleted. A type that keys no row names no union box. `emit_anon_fields` no longer
imports `unRowOfName` or `unionSpellingOfTy`.

## Proof

- **Seed:** fixpoint.
- **The full sweep:** CI's `sweep` label. Expected identity.
