# START-2: `ref if never arm` (2026-11-26)

Regen-10 lists 2 units: `match/never-first-arm-nullable-record-binding.vl` (`h`) and D3354's
witness. Each is a `match` whose first arm calls a user function returning `never`, and whose
value join is a nullable record.

`refIfArm` writes such a call as the arm's statement, then missed when `irBodyLeaves` did not see
the body leave. A call node's lowering already ends in `unreachable` (`callEndsNever`), which
legacy writes too; there is just no `STrap` node for the check to read. A probe that appended an
`STrap` wrote `unreachable` twice. With the check dropped, the output is byte-identical to legacy.

`ir-parity`: byte-identical on both programs.
