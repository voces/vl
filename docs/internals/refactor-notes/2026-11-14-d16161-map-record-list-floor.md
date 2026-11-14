# D16161: the default instance for a map of record lists

Lane E, 2026-11-14. Closes [D16161](../inventory/D16161.md) and files
[D16162](../inventory/D16162.md).

`monoPinMapSlot` (emit_mono.vl) pins a map whose value the checker left open to the default
instance of each function stored there. It had arms for a function, a list of functions, a list
of lists, a record and a map. A list of records fell to the decline, so its mv slot was never
minted, and the map's construction refused with `unsupported map value type`.

The new arm gathers each stored list literal's elements and pins them through
`monoPinStoredRecords` at slot path `v`, `e`, the record arm's own routine one step deeper. It
then types each stored list at a list of the result.

Grading, against master:
* 13 hand probes cover: two uncalled members, `set`, `?? []`, an i32 key, a read of another
  field, function scope, `delete`, a call that pins the instance, and `keys()`. All run, and the
  last two run on master too.
* A record nested in the element moves from `unsupported map value type` to the value-floor
  reject the bare nested record already gives on master (D16162).
