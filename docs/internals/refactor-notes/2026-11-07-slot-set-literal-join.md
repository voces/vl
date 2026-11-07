# A list literal's record elements join their function sets (2026-11-07)

Lane step 2, PR 1, of "a function-holding slot's rep comes from its identity set". It follows
[2026-11-07-slot-identity-set-shadow](2026-11-07-slot-identity-set-shadow.md), which named the
`id-uncovered` class: one slot written with two functions, as in `[{f: inc0}, {f: dbl}]`, and
built as an id of a tagged set that lacks a member of the slot's set.

## What changed

`checkArrayLitNode` joins two record elements' function sets field by field
(`elabFnJoinElemTy`, the list-element form of `elabFnJoinDeepTy`). Before, it joined sets only
for a bare function or a list of them. So the literal was typed at its first element's set
(`{inc0}`), a call through the slot tagged that set alone, and `dbl` was written beside it as a
closure. Now the literal is typed at the union of its slot's writes, `{inc0, dbl}`, and the
tag decision covers every member written into the slot.

The join declines, as before, when a function leaf has no
set or a set holds a lambda: a lambda beside a generic member would need that member's closure
(`hole-fn-record-list-literal-relayed-to-field-call.vl`, the first draft's one `runs → not-runs`).

**Why the fix is in the checker and not in `check_fn_tag.vl`.** The tag decision is already
made per set. What was wrong is the set: the call reads it from its callee's checked type. If
the decision kept the type at `{inc0}` and tagged `{dbl}` too, `dbl`'s id would be dispatched
over `{inc0}`, and the program would print a wrong answer. A bound literal already took the
union (`letLitListsWidenAt`). A returned or passed one now takes it at the literal.

## Measured

Shadow rows (`scripts/id-shadow/run.sh --rows`) over 6,345 programs, filtered from
`scripts/sweep.vl -- list` by a broader source regex than step 1's. They hold 3,641 slot writes:

| verdict | base | candidate |
|---|---|---|
| `id-uncovered` | 9 | **0** |
| `clo-set` | 701 | 710 |
| every other verdict | unchanged | unchanged |

Only the 9 programs' rows moved. Their writes became `clo-set` (closures over the union set), not
`tag`. Their bound twin is built the same way: `const xs = [{f: inc0}, {f: dbl}]` reads
`clo-set`, because the tag decision does not tag a set held in a record field of a list.
Tagging that position is the static-dispatch half of step 2. It is not needed to run.

Outcome: the 10 loud emit rejects of the class run with the wanted output. They are
`d15221_{lit,deep,nest,reb,ufcs,arg}_dbl`, `d15203_loud_mixed_{set,nested}_records`,
`d15209_mixed_one_dbl` and D15228, which is closed. The 3 that already ran print the same. A join whose
functions return different types is still D15221's check refusal.

## Proof

Both seeds are fixpoints (master `dea6eb8b` built to byte-identical; the candidate refreshed twice).
`scripts/sweep.vl -- diff` reads 23,603 same, 0 bytes-only, 10 output movers and 0 `runs → not-runs`.
The 10 movers are the cells above, each `emit_reject → runs`.

Seed size: 6,483,220 → 6,483,796 bytes (+576, +0.009%).
