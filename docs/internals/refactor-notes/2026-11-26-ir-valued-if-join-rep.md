# A valued `if` join is typed at the rep it is held at; a ref `if` arm goes in by the converter (lane COV-START)

**What.**
- `ifRefExpr`: a non-record join whose node type's rep is not the join rep `jr` (a list of
  un-annotated-function records delivered as an element of an annotated list) types its out at
  `repTyOf(jr)`. The out was typed at the checker type and held at `jr`, which verifier rule 3
  refused (`v2's rep is not its type's`). Master fails the one-element spelling; #10411 exposed
  it in more positions (COV-UNION's review, not blocking there).
- `refIfArm`: an arm at another rep goes through `irConvertStored`, the cell converter, before
  `ref if arm rep` misses, as #10411 did for list elements.

**Measured** (per-function shadow-5 census, master `2b260e6d5` vs head, both probes built alike):

| population | fnc | fnu | starts claimed | newly claimed / missed |
| --- | --- | --- | --- | --- |
| tests/cases | 88,549 → 88,549 | 172 → 170 | 7,542 → 7,543 | 0 / 0 (2 moved to `convert record -> nullable`) |
| witnesses | 22,486 → 22,486 | 45 → 44 | 5,053 → 5,054 | 0 / 0 (1 moved likewise) |
| capability probes | 650 → 650 | 4 → 4 | 276 → 276 | 0 / 0 |
| distilled | 46,956 → 46,956 | 5 → 5 | 9,430 → 9,430 | 0 / 0 |

Newly claimed start bodies: `record-join-layout-prefix-runs.vl` and D2701's. `is-narrower-map-tests-values.vl`'s
`test` instances now claim with other bytes than legacy (one more local), behaviourally equal (its
`@log` lines match). New fixture `tests/cases/lists/valued-if-list-element-at-element-rep-positions.vl`
(alone, before and after another element) is claimed under `VL_IR_REQUIRE_CLAIM=1`; master fails
rule 3 on two of its functions. `ir-identity.sh --cases`: 0 differ, behaviour 167 of 167 same.
