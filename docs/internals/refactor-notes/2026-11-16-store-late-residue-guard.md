# The late tag decider keeps a named, closed residue, 2026-11-16

Lane STORE, after the holder rule. Coordinator ruling 2026-11-16 on the per-instance key question:
(c) now, (a) next. The decision after the elaboration (`fnTagRedecide`) stays, but only for the sets
named here, and a guard stops the residue from growing. Option (a), consuming InstReq's instance
key at check, is the next stage, after a design note agreed with L2.

## The classes

`setBindTryClass` records, at check, why the set-binding rows left each set to the late decision.
There is one letter per reason, and a set can carry several:

| letter | reason |
|---|---|
| G | a generic member |
| S | reaches a stored parameter |
| V | handed to or by a set's members |
| P | partial |
| J | a one-member set that follows a join |
| C | delivered as a closure |
| T | reached by the rows, none of the above: tried, and the check refused or left it |
| N | not reached by the rows (not in the producer's try list) |

These letters cover every late decision, so a probe that fires on "a set outside the classes" would
be empty by construction. The guard therefore names the residue row by row, not by class.

## The guard

The tag decision after the elaboration appends one row per set it tagged or untagged against the
check: `tag <class> {members}` or `untag <class> {members}`. The rows go on the `$VL_LATE_DEMANDS`
list, so the host needs no change. `scripts/late-demands.vl` separates them from the demands, whose
counts and baseline are unchanged, and checks them against `scripts/late-tags-baseline.txt`:

- a row the baseline does not hold fails `--check`;
- a row that is gone prints, and the PR that earned it lowers the baseline with `--write-baseline`.

A set moving from one class to another counts as a new row. A fix that only reclassifies a set
writes the baseline in its own PR.

The existing emitFail probe (#8729, extended by the holder rule) stays. It fails the compile of the
one T shape the check refused with every call's facts.

## The residue

All of `tests/`, fixpoint seed, holder rule on N3 on master.

| class | rows (sets) | programs |
|---|---|---|
| N | 138 | 69 |
| T | 120 | 73 |
| G | 67 | 54 |
| P | 45 | 30 |
| GP | 28 | 24 |
| GSP | 15 | 12 |
| V | 14 | 5 |
| J | 9 | 7 |
| C | 5 | 4 |
| PC | 4 | 3 |
| SP | 4 | 4 |
| PJ | 3 | 2 |
| S | 3 | 3 |
| GS | 2 | 2 |
| GJ | 1 | 1 |
| total | 458 (456 tag, 2 untag) | 249 |

Measured before the holder rule's hand-back exclusion and before #8805. With both, the baseline holds
460 rows in 251 programs: #8805 added `generics/member-call-through-param-alias-map-fn.vl` (`tag N {half}`), and the holder rule's own fixture `closures/hole-fn-record-list-handed-back-then-called-two-orders.vl` adds `tag T {inc,half}` (the late decision tags it through the hand-back).

By letter, as sets / programs carrying it: G 113/91, P 99/69, N 138/69, T 120/73, S 24/19, J 13/10,
V 14/5, C 9/7.

The two untag rows are the pre-existing late drops: `G {ginc,dbl}` and `T {inc0,dbl}`.

## Grading

- Late demands: 9 in 7 files, unchanged.
- Output: only the host's late-list accessors read the rows, so output is byte-identical by
  construction.
- Control: a seed that drops the holder rule's check half fails `--check` with 39 new T rows
  (exit 1). This build fails with none.
- Phase state: one more checker import in `emit_elab.vl` (the late-list accessors import
  `fnTagLateRows`), and no new cross-phase write. The rewritten baseline also records falls
  master's code had already earned (`emit_elab` hidden 11 → 8, surface to 335 with this import;
  `check_core_state` cross 18 → 16). A first draft appended the rows from
  `emit_sections` and cost one cross plus one surface.
- L2 self-compile fuel: +0.2%. Seed size: within the gate.
