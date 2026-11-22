# IR verifier self-tests keyed by id (2026-11-22, lane IR-D1)

Until now `irVerifySelfTest(k)` dispatched on an integer `k`, and the shadow test compared against
an array indexed by `k`. Two lanes that each added a negative case took the same next number, and
five did on 2026-11-22. A case is now a string id in `selfTestIds` (`compiler/ir_selftest.vl`),
and `caseFn` branches on the id. The host reads the ids off the module and checks each one against
an `{id: rule}` map. The test refuses a duplicate id, a map entry the module does not list, and a
listed id the map does not name. Adding a case adds one list line and one map line, in any order.

## Migration

26 cases before (`want` had 26 entries) and 26 ids after. With the old seed's
`irVerifySelfTest(k)` for k = 0..25 against the new seed's case at each list index, all 26 name
the same rule. `irBoundsStrSelfTest` (two cases, boolean) is a different export and stays as it was.
