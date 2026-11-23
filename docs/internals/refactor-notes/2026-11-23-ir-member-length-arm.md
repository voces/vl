# One `.length` arm for legacy and the IR (2026-11-23, lane IR-N5)

`memberReadPlain` refused every `.length` that is not a record row's own field. Legacy's
`emitMemberNode` takes such a read along an ordered set of arms and reaches the plain member read
(`emitMem`) when none applies. A record field read through a binding narrowed out of a union with a
list is one: 28 of the 38 `member record` functions on master 4cb73575.

The pre-review vetoed an IR-side copy of that order, and the coordinator ruled that both sides share
one predicate. The IR must never read a table legacy fills while emitting.

## The change

- `memberLengthArmOf` (in `emit_plan_union.vl`) returns the arm, in `emitMemberNode`'s order, from
  the program alone: `field`, `growCandidate`, `armSite`, `atomStr`, `list`, `map`, `mem`.
  `memberLengthArmPastGrow` is the order past a grow candidate.
- The grow arm's only emit-time input is the list-fit shadow read (`listFitShadowRead`, over the
  `fitSh*` rows `listFitShadowSet` fills while emitting). It is not part of the predicate.
  `growCandidate` is its pure part: a named receiver, a grow row (`listFitGrowRow`, a per-function
  scan of the program), a `TyArray` grow type, a list-fit element kind.
- Legacy dispatches on the arm. On `growCandidate` it runs `emitListFitGrowLen`, which alone reads
  the shadow rows; a declined one takes `memberLengthArmPastGrow`. `mapLengthPlain` asks the same
  arm.
- The IR's `memberReadPlain` accepts `field` and `mem` only, so it declines a grow candidate and
  never reads `fitSh`.

A pure "emitted before this read" form of the shadow fact (the coordinator's design (a)) was not
taken: the row depends on emission order, and node indices do not follow it once rewrites
allocate nodes.

New test case: `records/length-field-read-on-a-narrowed-record-arm.vl`.

The measurements are in the PR body.
