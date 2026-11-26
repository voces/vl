# IR box ladder: a `null` boxed ahead of the record rungs (2026-11-26, lane COV-IS)

- **The miss**: `box ladder` for a `null` literal delivered into `N | null` (`N` a union of records
  with literal tags) in a program that also declares a record `{ tag: string, v: i32 }` its arms'
  tags soften toward (D15954). There one of `holeBoxPlanOf`'s record predicates (the "every rung
  below" guard) answers for the bare `null`, so the plan laddered before its `null` rung.
- **What landed** (shared plan): the `null` literal rung moves ahead of that guard. A `null` is no
  record whatever row its context softens it toward; the box is the null tag and the bottom ref.
- **Legacy**: claims-off bytes compared over every existing `tests/cases/*/*.vl`, master's claimless
  compiler (built in a master tree) against this one; the PR body carries the count.
- **Q58 position sweep** (`tests/cases/unions/null-into-tagged-union-beside-softened-record-positions.vl`,
  new): in a list, passed, returned, bound, assigned, as a field and at the top level. Master: the
  list position and the start body `box ladder`; here all claimed and byte-identical, as is
  `unions/literal-tag-arm-row-not-taken-by-string-record.vl`.
