# IR coverage: a field narrowed to `null`, and an effect-free right `null` side (lane COV-UNION, 2026-11-25)

## `member record`: a read the narrowing leaves as the `null` unit

`narrowed-null-field-elem-compared-with-other-nullable`'s `field`: `o.f` in the `else` of
`o.f is boolean`, where `f: boolean | null`. The read records `nulnone`; the field stores
`nulbool`. Legacy writes the field read, drops it, and pushes `ref.null none`. The IR already
routes this read through `nulUnitPlaceRead` (`nuRead`). Its place read refused, because no
`fieldStoresRead*` tail of `structFieldPlain` takes `nulnone` over `nulbool`.

- `structFieldAt` (`emit_plan_union`) also takes a `nulnone` read over any stored kind it owes no
  recover to. The builder reads such a read at its stored kid (`atKid`) when the read's rep is the
  `null` unit, since `nulUnitPlaceRead` drops it.

## `null name test of a non-name null side`

`zi == o.f`: a name's null test whose `null` side is on the right. Legacy runs the side after the
tested name; the IR writes it ahead of the test, through `nulNoneEffect`, and drops it after.
That order was admitted only for a store that commutes (`rightNullStoreCommutes`). An effect-free
side reads alike in either order, so it is admitted too. `eq-generic-read-operands-stored-apart`
is now fully claimed.

## Measured

Class cut (the member-family programs plus both sweeps), master `5b6978a23` before and this tree
after:
- `member record` function rows: 3 → 0.
- `null name test of a non-name null side`: 2 → 0.
- Claimed functions: 218 → 223 of 241. Start bodies: 20 → 21 of 29. Fully claimed programs:
  10 → 12.

Q58 sweep: `tests/cases/null/narrowed-null-field-read-in-each-position.vl` (compared on either
side with another nullable, an argument, a return, a print). Its output equals master's. Master
reports `member record` and `null name test of a non-name null side` on it; this tree reports none.

## Left

- `elem` in the same program: `index element coercion`, the class #10184 moved units into.
- `record-list-call-spread-beside-wider-part-runs`'s start: a member read carrying a narrow op
  (`memReadNarrowOp`).
- `member unsup`: an empty literal's unpinned element kind.
- `const q = o.f` with `o.f` narrowed to `null`: `declaration coercion`.
