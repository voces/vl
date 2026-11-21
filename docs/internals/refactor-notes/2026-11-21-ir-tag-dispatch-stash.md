# IR coverage: a tag dispatch after an operand (2026-11-21, lane IR-N7)

On master 77c02d79 the census's `tag dispatch after an operand` held 100 `tests/cases` functions
(66 alone, 60 files). The other two classes the coordinator moved here, `tag dispatch lambda arm`
and `boxed tag dispatch`, read 0 there. The builder refused at two sites: a dispatch whose body
already ended in a temp (`endsInTemp`), and a binary right operand whose staged lead sat below a
dispatch's stash (`tagStashFrom`).

Legacy writes the earlier operand, then the dispatch: the callee's id set into the stash local, then
the `if` chain. The IR builds the same nodes in that order. The lowering refused it because it
writes temps at their use: the stash consumed none of the pending temps (`non-stack temp: out of
order`).

## Change

- **The stash stages the earlier operand.** `RTagStash`'s effect arm stages the pending temps below it
  (`stageLead`, as a valued `if` does), raises the floor over them while it writes the callee, and
  hands the roots back to `pending` for their reader after the dispatch.
- **The stash is stack-neutral.** `liveNeutral` marks the bytes it writes (a value set into a local)
  as leaving the stack as it was. Without it, `liveTake` refused the staged value's read
  (`stack value read out of order`) while writing identical bytes.
- **The builder's two refusals are deleted,** with `tagStashFrom`.

## Measured

On the 60 files, against master's seed: covered = matched 445, with no mismatch row; master had
covered 412 and matched 379 there with the refusals removed but the lowering unchanged. The full
census is in the PR body. The row `tests/ir-shadow-rows/tag-dispatch-after-operand.vl` (a dispatch
after a temp, and one after a dispatch) has 2 of its 4 functions as `tag dispatch after an operand`
on master's seed; here all 4 are covered and matched.
