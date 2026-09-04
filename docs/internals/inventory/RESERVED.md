# Reserved inventory id ranges

One line per range, in the form:

    D<lo>-D<hi>  <holder>  <YYYY-MM-DD>  <what for>

`scripts/inventory/ls.py --next` SKIPS every id in a live range and prints which ranges it
skipped and who holds them, so the reservation is what the tool enforces rather than what two
people remember. `--reserve` and `--release` edit this file; `tests/vl_inventory_rows_test.ts`
fails when a range is stale (every id in it filed) so a forgotten reservation is a red rather
than a note that quietly widens.

**WHY THIS FILE EXISTS.** `ls.py`'s own header used to say reserved blocks "remain a
coordination convention written down in the inventory README, because two agents running this
one second apart both get the same answer". That convention failed four times, and the fourth
was two sessions colliding *while actively coordinating about ids in the same conversation* —
one reserved D1510-D1519 minutes after the other had handed D1510-D1529 to a running agent.
A convention that fails inside its own coordination is not a convention, it is a missing
feature. Nothing was lost that time only because the collision was noticed before either
agent filed.

A range is cheap. Take one before minting, release it when the work lands.

<!-- reservations below; the marker is what --reserve/--release edit around -->

D1480-D1499  vl-6a sweep agent  2026-09-03  ordinary-program sweep, D1480-D1486 filed
D1500-D1509  vl-cb glean agent  2026-09-03  VL-016, the compiler trap (D1500 filed)
D1510-D1519  vl-cb glean agents  2026-09-03  VL-018 (D1510), VL-017 (D1511)
D1520-D1539  vl-6a glean agent  2026-09-03  VL-003, VL-004, VL-005
