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
D1900-D1919  vl-c3  2026-09-07  fix lanes 2026-09-07 (D1866 residue: a module-block-only union registers no map member; later)
D1920-D1929  vl-c3  2026-09-07  row-25 refusal sites (a4674d1; D1920 filed)
D1930-D1939  vl-c3  2026-09-07  day-one sampler follow-ups (aab99b3)
D1940-D1949  vl-c3  2026-09-07  kind-ladder lane
D1960-D1979  vl-11  2026-09-22  plumb consumer lanes (PL-001..PL-007)
D1980-D1989  vl-11  2026-09-22  SIMD S3
D1995-D1999  vl-11  2026-09-22  review follow-ups
D2000-D2009  vl-11  2026-09-22  PL-014 perf lanes
D2010-D2019  vl-11  2026-09-22  review follow-ups 2
D2020-D2029  vl-11  2026-09-22  PL-003(b) and follow-ups
D2030-D2039  vl-11  2026-09-22  getters v1 lanes
D2040-D2049  vl-11  2026-09-22  review follow-ups 3
D2050-D2059  vl-11  2026-09-22  review follow-ups 4
D2060-D2069  vl-11  2026-09-22  persona review defects
D2093-D2099  vl-11  2026-09-22  getter diagnostics follow-ups (G3 field-bound message)
D2100-D2104  vl-11  2026-09-22  D2060 residue (record covariance)
D2110-D2119  vl-11  2026-09-23  function-list calls (PR #3050)
D2120-D2129  vl-11  2026-09-23  getter step budget lane (D2061-D2063 residue; D2120 filed)
D2130-D2134  d2017-lane  2026-09-23  D2017 capture-memo residue (D2130 filed)
D2176-D2179  vl-11  2026-09-23  PL-014 lane L10 (immutable module const globals)
D2242-D2243  vl-11  2026-09-23  D2234 lane (tail-arm return check; D2243 filed)
D2268-D2269  intrinsic-shadow-lane  2026-09-23  import-alias intrinsic shadowing (D2268 filed)
D2280-D2282  pl031-lane  2026-09-23  PL-031 map tombstone hang
D2309-D2312  plumb-compile-perf  2026-09-24
D2335-D2338  plumb-tail-units  2026-09-24
D2407-D2410  lane-N  2026-09-25  narrowing invalidation (D2400-D2405 closes; D2407, D2408 filed)
D2475-D2478  lane-S2  2026-09-25  unreachable self-functions (D2475-D2477 filed and closed)
D3246-D3248  lane-NB  2026-09-29  literal-binding inference, owner ruling (B), plumb PL-054/PL-056 (D3246 filed and closed)
D3728-D3735  lane-L2  2026-10-05  sunpa SP-037 step 2, D3664 (D3728-D3734 filed)
D3742-D3749  lane-UA  2026-10-06  empty-list pins at a hole argument and a record field (D2218, D2640, D1471 closed; D3742-D3746 filed)
D3760-D3764  lane-GN  2026-10-06  getter-alias narrowing (clause 1) + buildFnMap per-instance perf
D3770-D3774  lane-DX  2026-10-06  diagnostic cascades, sunpa missing-import report (D3770, D3772, D3773 filed and closed; D3771 filed open)
D3775-D3779  lane-S3  2026-10-06  soundness: D3757, D3746 closed; D3771 left open (attempt withdrawn); D3775 filed
D3785-D3789  lane-S4  2026-10-06  hex-literal assignment values at i64 (D3733, D3734 closed) + caller write after a callee-pinned element (D3775 closed); D3785, D3786 filed
D3790-D3794  lane-CC  2026-10-06  sunpa SP-048 (D3790, D3792 filed and closed; D3791, D3793 filed open)
D3795-D3799  lane-S5  2026-10-06  soundness: D3793, D3762, D3744 closed; D3795 filed and closed; D3796, D3797, D3798 filed open
D3800-D3802  lane-DG  2026-10-07  redundant-annotation hint at a `??` default (D3798 closed; D3800 filed open)
D3803-D3807  lane-PF  2026-10-07  sunpa per-frame allocation (item c): D3803 filed and closed; D3804 (list vectors, needs design), D3805 (for-in over a literal) filed open
D3811-D3813  lane-DH  2026-10-07  load-bearing annotations hinted redundant (D3800 closed); D3811, D3812 filed open
D3855-D3864  lane-SC  2026-10-08  alias residue: D3855-D3858 filed and closed; D3859 filed and closed with D3865; D3860, D3861 filed open; D3862 filed and closed; D3863-D3864 free
