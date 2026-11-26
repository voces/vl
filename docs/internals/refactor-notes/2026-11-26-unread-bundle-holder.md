# A bundle bound to a name nothing reads is kept whole (lane COV-CLOS, 2026-11-26)

D17670: `const _held = lap2((a) => a)`, where `lap2` returns its parameter after calling it at two
signatures, was refused by legacy ("called where its result is not used at one of them") and missed
by the IR (`bundle result pick refused`). The elaboration lets a holder keep the returned record
whole only when something reads it at two members (`two` in the holder's keep-whole note); a holder
nothing reads met none of those reads, so no member fact was written and the call had nothing to
pick. A holder with no reads at all now keeps the record whole, as a dropped call's value is
dropped: the binding holds the record and nothing ever picks from it.

## Measurements

I8 census over the `tests/cases` programs, the new position test among them (base at master
`acac04b93`, head on it): `bundle result pick refused` 1 → 0. Claimed functions 98,401 → 98,415,
unclaimed 261 → 260, claimed starts 8,516 → 8,517, claims fallen back 11 → 11; 0 claimed functions
or starts lost, no other class moved.

`scripts/silent-sweep/distilled/regress.vl` on the head seed: no runs lost (0 of 261,224 cells).

D17670's witness and its grading list (inside a function, the `f64`/`i32` `lap` spelling, an
unused `let`): each refused on the base seed, each runs on head printing `1`, every body claimed
under `VL_IR_REQUIRE_CLAIM=1`.

Q58 position sweep (`tests/cases/closures/bundle-held-by-unread-binding-positions.vl`: a module
`const`, one inside a function, a `let`, the `lap` spelling, beside a holder that is read): refused
on the base seed; on head every body claimed, no late demand.
