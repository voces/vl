# IR: a returned container of hole-function closures (2026-11-23, lane IR-D1)

The corpus's `return coercion` cells after #9723 are a different mechanism under the same miss:
a container literal holding hole-function closures (`inc0`, `dbl`, `half`), returned where the
result type leaves those closures open (`(_) => _`) and the value fills them (`(i32) => i32`).

## Mechanism

At return the builder retags a value whose rep differs from the result only in closure openness.
It asked `holeRetagNoted` with `clo` false, so only a list (`listRetagHole`) was covered. It now
asks `cloHoleRetag` for a map too (`retHoleMap`). A map's values are the one closure struct
whatever their signature, so legacy returns it as it stands (`d16121_return_inferred_ann`).

## Left, with mechanism

- The record cells, `d15221_opt*`/`optb*` (4), and `d15293_bound_returned` (a list of records).
  The literal's own record type has no heap: legacy builds it straight at the result's row, and
  its inner `{ f: … }` records sit on two heaps under one open type, a closure struct for one
  and a function tag for the other (the hole-function tag-vs-closure layout). Building at the
  result row would need a temp type naming both; N8 files and holds the row.
- A record retagged for closure openness on one heap is refused by the verifier's retag rule
  (rule 2; `hole-fn-param-into-returned-record.vl`'s `mk2`, `mk5`), so the retag is maps only.

## Readings

Master 1d35bb97 → head, fixpoint seeds: ir-i8 census `return coercion` rows in tests/cases
9 → 5 and in the distilled corpus 7 → 6; ir shadow tests/cases matched 79,077 → 79,081.

## Legacy tails the IR calls

None new.
