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

**What it fixes, on top of master after #8186.**
- Three D16301 declaration-order cells, `dord026`, `dord027` and `dord028`, go from `trap_loads`
  (`indirect call type mismatch`) to `runs`, each with its exact `@log` output.
- Measured before #8186, the union also fixed `dord018` to `dord023` and `dord025`. #8186 fixes all
  seven of those by itself (its head was built to a fixpoint and run), so they are not counted
  here.

| reading | value |
|---|---|
| seed | fixpoint (both refreshes exit 0) |
| L2 identity | byte-identical |
| corpus identity (before #8186) | 1,832 of 1,833 files, same module and diagnostics. The mover was `dord019`, which #8186 now fixes. |
| `regress.vl` (merged with master at 0211a2ff) | 0 runs → not-runs, 0 → silent, 3 other movements (`dord026`–`dord028` to `runs`). Baseline written from the merged fixpoint. |
| D16365 grid (`hole-param-record-empty-list-field.matrix.vl`) | unchanged: 52 SILENT and 2 RUNS before and after. That is expected under the ruling, because G's elaboration change uses this primitive. |
| L2 guest fuel | 86,807,164,848 → 86,878,177,294 (+0.08%) |
| net compiler lines | +43 |
| pin helpers (`emit_mono.vl`) | 908 → 908 |

**Stage 2c-2 still deletes** the 10 non-pin `tyMutEpoch` bumps, the `TY_OPEN` sentinel handling
and `tyVarOwner`'s hole half. That commitment, from the 2b note, stands.

**Diagnostics.** Two error fixtures change sentence and place, by the coordinator's ruling. With
the two open children one hole, the second, conflicting use is refused where it is written
(`push: cannot add string to i32[]`, `cannot assign string to i32`), as an annotated program is,
instead of at the earlier store. Both stay check rejects.

**Held** at the coordinator's ruling: this lands together with lane G's D16365, which stacks on it.
