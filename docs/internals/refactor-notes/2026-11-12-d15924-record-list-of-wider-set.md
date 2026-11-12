# D15924: a record of a smaller function set in a returned list of a wider one is decided with it, 2026-11-12

This closes D15924, a clause-2 loud emit reject (`the lists this function returns are built at
different rows`). Two returns hold lists of records of different sets of un-annotated functions
of different results, `[{ f: inc0 }, { f: half }]` beside `[{ f: half }]`.

## Mechanism

A probe numbered every exit of the tag plan (`ftPlan`, `ftScan`) and logged each refused holder
(`ftHoldCtxOk`). The one refusal was the smaller set `{half}`'s record `{ f: half }`, an element
of the second return's list. That list is typed at the result's wider set `{inc0, half}`. The
`ArrayLit` holder arm had D15234's rule for maps (`ftMapListOfWider`) and none for records, so
`{half}` stayed undecided and neither list was built at the tagged rep. With both functions in
each list, the sets agree and the program ran.

## What changed

- `ftRecListOfWider` (`check_fn_tag.vl`) is the record twin: a record whose field carries `s`,
  in a list of records of a wider set `s` is within, holds `s`'s records. An undecided wider set
  is decided with `s`, as `ftSubNeed` notes.
- Both rules share `ftHolderListOfWider`, which takes the hold kinds (3 and 7 for maps, 2 and 6
  for records).

## Witnesses

The fixture `tests/cases/closures/returns-of-record-lists-of-different-fn-sets-called-through-result.vl`
covers:

- the witness, each return called, and a `for` over the result;
- the returns swapped;
- three functions;
- the nested-record twin the row names.

The record, list, loop and if-arm matrices (`record-fn-field-two-results`,
`two-returns-record-fn-field`, `record-held-list-fn-field-for-loop`,
`if-arm-record-fn-field-two-members`) all have 0 runs → not-runs and 0 silent, base against head.

D15925's list witness, a value `if` of such lists, is still refused. That gap is a different exit
of the plan.

## Measurement

This can move outcomes, so the sweep is CI's under the `sweep` label.
