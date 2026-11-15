# L5 step 3b: the elaboration's pin notes as a rollback family (2026-11-15)

Part of L5 step 3 (`CheckRun`, `2026-11-14-phase-products-design.md` §2.2). This slice is the
prerequisite for lane relate's P3 (`2026-11-15-subst-pure-design.md`). With it in place, P3 can
drop the pin notes when a fit question forks a run, and then delete the two quiet gates that keep
those notes out of a speculative check.

## What changed

- **`check_elab_cap.vl`: `type ElabPinMark = {bindN, bindT, epoch, rows, lastN}`, `elabPinMark()`
  and `elabPinRollback(m)`.** The mark is a snapshot, not just a length, because three writes are
  not pushes:
  - `elabPinBindingIs` replaces the binding register (`slice`) and bumps `elabPinEpoch`, so the
    mark holds the two list references and the epoch;
  - `elabHolePinNote` appends into the last row under the same binding, so the mark holds that
    row's pin count and the rollback trims its N and T back to it;
  - `elabHoleRowDropDecl` compacts rows in place, but every caller compacts from a mark it took
    itself (`check_calls.vl`), at or above an enclosing run's mark. `elabHoleRowsKeepStable`
    replaces the columns wholesale only on a check restart (`fnTyFactsReset`), never inside a run.
- **`check_rollback.vl`:**
  - `CheckMark` gains `elabPin`, and `checkRollback` restores it when the set names the new
    family `RB_ELAB_PIN`;
  - `RB_ALL` keeps its value and its comment now says it excludes the pin notes.
- **No site set names `RB_ELAB_PIN` yet.** Two writers still record under a quiet run today:
  - a live capture's notes pass `elabHolePinNote`'s and `elabValueRowNote`'s `!live` gate;
  - `elabPinBindingIs` has no gate.
  
  Rolling them back at a current site would change answers. Lane relate's P3 adds the family to
  its fork's set and deletes the gates. That is where the behaviour change is graded.
- **`PRB_TABLES` is unchanged** for the same reason. The rollback assertion would report the rows
  a live capture keeps.

## Gate

GATE_PLACEHOLDER

## Lines

The compiler is **+35 / −1, net +34** over 2 modules. This slice adds the mechanism, and lane
relate's P3 deletes the gates and their reads.
