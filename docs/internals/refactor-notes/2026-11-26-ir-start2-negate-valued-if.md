# START-2: `integer negation of a valued if` (2026-11-26)

Regen-10 lists 2 units: `numerics/negated-join-adopts-typed-peer.vl` (`@start`) and D16671's
witness.

Legacy writes integer `-x` as `0 - x`, with the zero pushed before the operand, so a valued `if` in
the operand sits above that zero. The builder missed there (`ifBelowLead`). It now stages the zero
below the `if` as a lead (`irBStageLeads`, an `RStage` of the immediate inserted ahead of the
operand) and builds the negation as `sub` of that lead and the operand.

`ir-parity`: byte-identical on both programs. The case is the position matrix: a join added to a
typed `i64` peer, bound at `i64` and `f32`, divided, and a `match` join.
