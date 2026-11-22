# IR verifier self-tests keyed by id (2026-11-22, lane IR-D1)

Until now `irVerifySelfTest(k)` dispatched on an integer `k`, and the shadow test compared against
an array indexed by `k`. Two lanes that each added a negative case took the same next number, and
five did on 2026-11-22. A case is now a string id in `selfTestIds` (`compiler/ir_selftest.vl`),
and `caseFn` branches on the id. The host reads the ids off the module and checks each one against
an `{id: rule}` map. The test refuses a duplicate id, a map entry the module does not list, and a
listed id the map does not name. Adding a case adds one list line and one map line, in any order.

## Migration

Migrated on top of the queue's train tip `vl-queue/BU1` (57177c29), which holds every positional
case: 32 before (`want` had 29 entries for 0–28, plus assertions for 100, 101 and 102) and 32 ids
after. The positional seed's `irVerifySelfTest(k)` for each old `k` against the keyed seed's case
of the same id: all 32 name the same rule, and each matches the map. `irBoundsStrSelfTest` (two
cases, boolean) is a different export and stays as it was.
