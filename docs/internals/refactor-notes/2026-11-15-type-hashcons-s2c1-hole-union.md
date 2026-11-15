# Type hash-cons stage 2c-1: two open children that meet become one hole (lane H), 2026-11-15

The first slice of stage 2c (`2026-11-14-type-hashcons-design.md` §2.2).

**What changes**
- A hole's solution may be another hole's code. `holeRoot` follows the chain, and every read
  (`holeView`) and pin (`holeSolve`) acts on the root, so one pin answers every hole linked to it.
- `tyLinkElem`, `tyLinkKey` and `tyLinkVal` link two unsolved open children. `constrainEmptyD`'s
  both-open list, map-key and map-value cases call them beside the existing `noteHoleLink`. The
  deferred link table therefore still runs, and its retirement is a later deletion.
- This is the primitive the coordinator's ruling on D16365 gives lane G: G links the record-field
  list holes across deliveries in the elaboration. A hole parameter's element stays a per-call
  derived hole, and moving it to one body solution is L2's work.

**What it fixes.** Seven D16301 declaration-order cells go to `runs`:
- `dord018` to `dord021` were `trap_loads` (`indirect call type mismatch`);
- `dord022`, `dord023` and `dord025` were `runs but wrong value`.

These are generic functions passed as values through `let` reassignment, whose open parameter
rows now share one solution. D16301's other cells, 31 of the 38 distilled, do not move.

| reading | value |
|---|---|
| seed | fixpoint (both refreshes exit 0) |
| L2 identity | byte-identical |
| corpus identity | 1,832 of 1,833 files, same module and diagnostics. The mover is `dord019` (above). |
| `regress.vl` | 0 runs → not-runs, 0 → silent, 7 other movements (the seven cells above, each to `runs`), over 1,477 representatives and 10,560 curated cells. Baseline written. |
| D16365 grid (`hole-param-record-empty-list-field.matrix.vl`) | unchanged: 52 SILENT and 2 RUNS before and after. That is expected under the ruling, because G's elaboration change uses this primitive. |
| L2 guest fuel | 86,807,164,848 → 86,878,177,294 (+0.08%) |
| net compiler lines | +43 |
| pin helpers (`emit_mono.vl`) | 908 → 908 |

**Stage 2c-2 still deletes** the 10 non-pin `tyMutEpoch` bumps, the `TY_OPEN` sentinel handling
and `tyVarOwner`'s hole half. That commitment, from the 2b note, stands.
