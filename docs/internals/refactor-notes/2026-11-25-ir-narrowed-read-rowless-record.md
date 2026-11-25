# IR narrowed read: a rowless record read at its storage row (2026-11-25, lane COV-IS)

- **The miss**: `narrowed read`, where a record local (a parameter, a callback's parameter or a
  loop's element) is held at a struct row (`J = { f: i32 | null }`) and read at a record type no
  struct row records (`{ f: null }`). Legacy stores the second at the first's row, so its read is
  the local as it stands; the two reps sit on different IR heaps, so no retag predicate admits them.
- **Scope**: 7 of the 21 rows on CENSUS's list at `0c946159` are a record or list read at another
  record or list rep. Six are this shape; `named/d15293_bound_returned.vl` (a list of records whose
  field is a string on one side and an `i32` on the other) is not.

## What landed

- **The delivery read**: `narrowedLocalRead`'s rowless arm (`boundRowlessReadTy`, landed for
  non-delivery reads in #9953) now also takes a delivery's seated read.
- **The variable**: the arm asks about the variable the read already holds (`rowlessReadTyOfVar`),
  so a loop's element (`fragLoopVar`), which `boundVarOf` does not name, is covered too.

## How it was measured

- **The class**: `lists/annotated-callback-over-built-list.vl`, `lists/map-identity-callback-over-built-list.vl`
  (2 functions), `unions/null-member-of-a-stored-box-field-prints.vl`, and the start bodies of
  `named/d15207_loop_over.vl` and `named/d16132_for_in_unann.vl` now match under `VL_IR_SHADOW=2`.
- **Legacy identity and the shadow**: see the PR body for the A/B over
  `tests/cases/{lists,records,generics,closures,objects,unions,types,structs}` and `distilled/named`
  against the compiler of #10135.
- **Q58 position sweep** (`tests/cases/records/rowless-record-param-read-at-its-row-positions.vl`,
  new): the callback parameter handed to a call, bound by a `let` first, a second callback's, and a
  module loop's element read. The miss is shape-sensitive (a module `for` over the source list
  moves the rows so it does not fire), so the sweep keeps the witness program's shape. On the base
  its 3 functions and start body are this miss; here all match.
- **Refused neighbours**: handing the parameter on as a return or a list element is the checker's
  own capability refusal ("no converting copy exists"), outside this class.
