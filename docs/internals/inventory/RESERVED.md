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

**THE HOLDER IS THE SESSION NAME OTHER SESSIONS CAN MESSAGE** — the one `ListAgents` prints,
not a name recalled from memory. The first version of this file had every holder inverted:
each block was labelled with the OTHER session's name, so the column that exists to answer
"who do I talk to" sent the reader to the wrong session for all four. A session that has
restarted may answer to a new name (`vl-6a` became `vl-cb` here); check rather than assume,
and if a block is filed by one session and fixed by another, say both.

<!-- reservations below; the marker is what --reserve/--release edit around -->

D1480-D1499  vl-d2 sweep agent  2026-09-03  ordinary-program sweep, D1480-D1486 filed
D1500-D1509  vl-d2 filed, vl-cb fixing  2026-09-03  VL-016, the compiler trap (D1500 filed)
D1520-D1539  vl-d2 glean agent  2026-09-03  VL-003, VL-004, VL-005
D1540-D1559  vl-d2  2026-09-03  sampler triage
D1560-D1579  vl-cb  2026-09-03  glean rows VL-025 (D1560), sampler residue (D1561, D1562), glean VL-021 (D1570) and VL-015 (D1571)
D1600-D1619  vl-cb  2026-09-04  glean VL-046 (D1600), the comment sweep's residue rows and follow-ups
D1620-D1627  vl-cb  2026-09-05  closure family: captured calls, inferred closure returns, fmt round-trip
