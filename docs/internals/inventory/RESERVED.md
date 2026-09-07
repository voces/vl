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
D1628-D1639  vl-cb  2026-09-05  second-pass fix follow-ups
D1670-D1679  vl-c3  2026-09-05  coordinator lanes 2026-09-05 night (D1667-D1669 clause-1 fixes, D1664/D1665 residues)
D1700-D1709  vl-c3  2026-09-06  coordinator lanes 2026-09-06 (arena-reader twin of D1696, D1697 list-of-list key, D1692 declaration refusal, D1686/D1687 residues)
D1710-D1719  vl-c3  2026-09-06  coordinator lanes 2026-09-06 (D1707/D1708 predictions, D1686/D1687 covariant residues, D1680 nullable map, later residues)
D1720-D1729  vl-c3  2026-09-06  coordinator lanes 2026-09-06 morning (optchain D1677/D1681 residues, D1686/D1687 covariant residues, D1712/D1680 rulings, later residues)
D1760-D1779  vl-c3  2026-09-06  fix and discovery lanes, 2026-09-06 afternoon
D1780-D1799  vl-c3  2026-09-06  fix and discovery lanes, 2026-09-06 evening
D1800-D1819  vl-c3  2026-09-06  fix and discovery lanes, 2026-09-06 evening (block 2)
D1820-D1839  vl-c3  2026-09-06  fix and discovery lanes, 2026-09-06 night (D1820 per-program mono ledger, D1821 annotated-helper two-pin trap, later residues)
D1840-D1859  vl-c3  2026-09-07  fix lanes 2026-09-06/07 (D1845/D1846 narrowing limits, D1850-D1854 variadics residue, campaign D1834-D1839 already in the earlier block)
D1860-D1879  vl-c3  2026-09-06  fix and discovery lanes, 2026-09-07 (D1833 residue, variadics residue, campaign rows, later)
D1895-D1899  vl-c1  2026-09-07  carved out of vl-c3's D1880-D1899 by the coordinator for the narrowing lane's residues (ROADMAP row 16's successor)
D1900-D1919  vl-c3  2026-09-07  fix lanes 2026-09-07 (D1866 residue: a module-block-only union registers no map member; later)
D1920-D1929  vl-c3  2026-09-07  row-25 refusal sites (a4674d1; D1920 filed)
D1930-D1939  vl-c3  2026-09-07  day-one sampler follow-ups (aab99b3)
