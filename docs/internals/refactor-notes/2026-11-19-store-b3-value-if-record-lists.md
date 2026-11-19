# STORE record-row producer: a value `if` of records holding lists (2026-11-19)

This closes D15303, handed over by F2 from family C. F2's emit_mono attempt built invalid wasm
beside a set-list record of the same shape, the D15641 coupling.

## Mechanism
On master no set is tagged for the witness `const r = if c { { fs: [inc0] } } else { { fs: [dbl] } }`
(check or late). The decision tries the join {inc0, dbl} at check and refuses at `ftPlan`'s member-leaf
test. Each arm's list element is typed at its own singleton set ({inc0}, {dbl}), so no node is a leaf
of the join, and nothing pulls the singletons in to be decided with it.

`ftJoinMapTailsNote` already did that for maps (D15393). It now does it for a join holding the set in
a record or list too: for each tail that is a record or list literal, `ftSubsetsNoteIn` notes every set
within `s` the tail's type carries. The singleton sets are planned with the join, all or none; their
leaves are the list elements, and every arm's list holds the join's ids.

## Measured (master fixpoint vs this branch's fixpoint)
- Late tag rows: unchanged (307).
- `VL_LATE_DEMANDS=1 vl check --codegen tests`: diagnostics byte-identical over the existing corpus.
- The new fixture `closures/value-if-of-records-of-hole-fn-lists.vl` matches `@log`, and master refuses
  it. Its 10 spellings: top level, in a function, the else arm, `match`, an extra field, nested lists,
  the mixed-storage arms in both orders (master refused both), returned, and beside a set-list record
  of the same shape.
- `check-filed-witnesses --strict`: 5,521 graded, 0 moved; D15303 runs as filed.
- Full @run A/B over 6,767 programs: 2 movers, 0 output movers.
  - The new fixture: RC 1 → 0.
  - `closures/tail-join-of-lists-of-hole-fn-records.vl`, wasm only: 669 → 615 bytes, 7 → 5 functions,
    no closure table, output matching `@log`. Its tail join's arm sets are now decided with the join,
    as ids.
