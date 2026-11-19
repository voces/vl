# STORE: a re-pointed record whose field aliases a list binding (2026-11-19)

This closes D16242, sent back by F2 after their consistency step: on master, the re-point leaves
`xs`'s set untagged.

Witness: `const xs = [id1]; let r = { f: xs }; r = { f: [id2] }; r.f[0](2); r.f[0](2.5); xs[0](3)`.
- With a literal initialiser (`let r = { f: [id1] }`) the checker widens `r` to the join over its
  writes, and it runs.
- D15392 widens through a field read of a list binding only when that read is the binding's only
  one. Here `xs` is called directly too, so `r` stays `{f: {id1}[]}`, the written `{ f: [id2] }`
  joins nothing, and no row is minted.

## Mechanism (three changes; ablation shows each is needed)
1. **`letFieldListsWidenAt`** (check_statements.vl): a field whose value reads a list binding read
   elsewhere too is widened over the record's writes (`elabFnFieldTy`). The binding keeps its own
   set, as a parameter's read keeps its (D15455): its own calls are not re-typed against the
   written functions.
2. **`ftRecFieldReadsNote`** (check_fn_tag.vl): for a record literal holding `s`, each set within
   `s` that a field's binding read carries is decided with `s`, all or none. `xs`'s {id1} is
   planned with {id1, id2}.
3. **`ftHoldCtxOk`'s FieldInit arm** takes a holder whose record holds a set decided with it
   (`ftTyHoldsDecided`), so `xs` stands in `{ f: xs }` while {id1} is planned under the join.

## Measured (master fixpoint vs this branch's fixpoint)
- Late tag rows: unchanged (307).
- `VL_LATE_DEMANDS=1 vl check --codegen tests`: diagnostics byte-identical over the existing corpus.
- New fixture `closures/record-field-aliasing-a-list-repointed-at-another-set.vl`: matches `@log`,
  and master refuses it. Spellings: the row's witness at two signatures, F2's minimal spelling, a call
  before the re-point, no call of the list, and the twin with no re-point.
- `check-filed-witnesses --strict`: 5,521 graded, 0 moved; D16242 runs as filed.
- Full @run A/B: see the PR.
