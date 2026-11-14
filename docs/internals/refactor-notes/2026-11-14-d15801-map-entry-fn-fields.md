# D15801: function fields of a map's entry literals

Lane E, 2026-11-14. Closes [D15801](../inventory/D15801.md) (F3 of the function-field family) and,
with it, [D15806](../inventory/D15806.md), [D9370](../inventory/D9370.md) and
[D15194](../inventory/D15194.md). Files [D16161](../inventory/D16161.md).

## What changed

* **Judge** (check_relate_core.vl). `holeSlotJudge` lifts its one-result judgment for a place
  through a map's entry, where the entry's own value path would be lifted. Three conditions
  apply: every function stored there sits in a literal written whole to an entry
  (`holeSlotMapLitWrites`), the read goes through no `?.` (`holeSlotReadsOpt`), and the place is
  not a bare element, which keeps the earlier lift.
* **Tag decision** (check_fn_tag.vl).
  * `ftSlotWrites` takes `m[k] = lit` into a map of records (kind 8) as `set` does.
  * `ftMapSetValTy` takes kind 8.
  * `ftMapEntryLitJoins` re-types each entry literal, a record or a list of records, to its
    place in the map's value row.
  * `ftHoldKind` answers a `| null` its inner kind 4 or 6, so a binding of a map read is a
    planned holder.
* **Stamp** (check_elab_cap.vl). `fnTagPlaceRep` reads an index or `get` step on a map as its
  value, `| null`, and peels a narrowed `| null` at each step.
* **Emit**. `collectAHeldRep` interns a held map's list-of-records value row and mv slot.
  `letHeldTyOf` gives a map read's binding its stamped `| null` rep.

## Grading

* `capability-matrix.vl`, before master `b8b695bf4`, after this branch. 0 `runs → not-runs` and
  0 silent over 14 templates.
  * `record-list-fn-field-two-results`: `map_value` and `map_set` un-annotated move from check
    refusal to RUNS.
  * `record-held-list-fn-field-for-loop`: the same two cells move from emit refusal to RUNS.
* `check-filed-witnesses --strict` over both inventories: every row as filed, 0 output mismatch.
* Thirty hand probes cover: index, `set`, `get` and `keys()` access; i32 keys; module and
  function scope; `delete`; a field bound and then called; a loop over a list entry; an entry
  overwritten. Each runs with the right output, or stays refused at check as on master. The
  check refusals that remain are a named-record entry, a push through an entry read, a `?.`
  call, two one-record lists (the first write pins the set), and a nested record (D15805).
* `hole-fn-records-of-different-results-set-into-map.vl` was an error fixture under D9370's
  ruling. It is now a run fixture, since D15791 and D15801 overrule that ruling.
