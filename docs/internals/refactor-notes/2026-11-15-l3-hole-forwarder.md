# L3 (c): the hole forwarder takes the row slot (D16403)

2026-11-15, lane I. The record-width rewrite (D3992, row slot `__R<decl>_<k>__<Record>`) read a
parameter's record only from its written annotation, so an un-annotated parameter its body
inferred at `P` refused a wider row that `t: P` accepts.

- **Candidate** (`wsCandidateAt`, `check_demands.vl`): a hole parameter's record is the declared
  record its inferred type holds (`wsHoleRecName`: `structNameOfTy` round-tripped through
  `cUserTypes`, so an anonymous record is no candidate).
- **Apply** (`wsApplyPending`, `check_width.vl`): a pending row now carries the parameter type it
  was noted at (`wsPendTy`), and a hole's annotation is spelled from it (`wsHoleTs`): the bare
  slot, `slot | null`, or `slot[]`. An undo restores the hole (`parType` -1); `wsOrigTyOf`
  answers -1 for it, so the call hold falls to `rowSlotBound`.
- No new mechanism: the instance, the hold and the forwarding pins are the annotated path's.

Measured on fixpoint seeds (master `da77a8e41` vs this branch):

- `record-param-width-{before,between}.matrix.vl`: `hole_fwd` annotated face check reject →
  RUNS; runs → not-runs 0, silent 0. `-after` 30 of 30 both.
- `d16403-hole-forwarder` named set, 9 cells, all `runs`; regress runs → not-runs 0.
- Still refused, as their annotated faces are: an anonymous record parameter, an exported
  forwarder.
