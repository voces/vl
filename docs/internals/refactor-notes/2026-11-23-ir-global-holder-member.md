# IR coverage: a module binding holding a returned bundle's member (2026-11-23, lane IR-N8)

`const c = lap((a) => a + 1)`, with `lap(f)` calling its hole parameter at two signatures and
returning it, keeps the bundle record in `c`; `const w = g()` (`g` returns `c`) keeps one member.
Legacy's cells are the record struct and that member's closure. The IR noted the globals' reps from
their types, `(_) => _`, whose closure rep is open, so the start body missed `open temp type`.

The elab fact was already there: the coordinator's proposed elab change was not needed. The holder
facts exist for these bindings (`elabHolderPut` notes `c`, and `holderMemberTy` answers for `w`);
only the IR's global path ignored the member one.

- **`globalHolderTy(d)`**: a module binding's held type, `holderRecordTy` or a closed
  `holderMemberTy`, as `irBDeclVar` gives a local's. `globalRep`, `globalHeldTy` and
  `globalInitValue`'s held mark read it.
- **A read where its type leaves a variable open** is the member's closure as the cell holds it:
  on the holed arm it is not retagged to the open rep, and otherwise it is read at the cell's rep
  (`member`). A plain read of such a global takes the held type where its rep is the read's
  (`globalReadTy`).

## Measured

On tests/cases' 7 `open temp type` start bodies (master's fixpoint seed against this branch):
3 → covered and matched (`hole-lambda-bundle-module-const-returned-one-member`,
`bundle-record-from-a-maker-used-at-one-signature`, `bundle-bound-at-one-member-before-another-binding-runs`).

Row: `tests/ir-shadow-rows/global-holder-member.vl` (master: start uncovered; branch: matched).

## Left

4 start bodies, other mechanisms: a closure built at `() => ((_) => _)`
(`hole-lambda-bundle-returned-from-top-level-lambda`), and one site each in
`coalesce-map-default-list-of-set-members`, `generic-helper-over-map-of-hole-fns` and
`optional-call-nested-record-beside-declared-record`.

## Legacy tails the IR calls

None new.
