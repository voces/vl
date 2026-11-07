# Step 7: `letInitCellKind`'s three classifiers, 2026-11-07

`letInitCellKind` read three type-blind classifiers that batch 1
(`2026-11-07-step7-classifier-batch-1.md`) kept. Two are gone. The third is a live defect.

**Method.** The shadow used in batch 1: a scratch compiler computed the old answer and
`letBindRepKind` (`repOfTy(letBindTy)`) at every call, and counted each pair with the let's name
and phase through `clsCensusEnter`. It was graded with `classifier-census.vl -- --keep` over
23,610 programs. Each trial deletion was then swept against its base.

| classifier | typed reader | agree | disagree | outcome |
| --- | --- | --- | --- | --- |
| `letIsClosure` | binding rep is `closure` | 766 | 2 | deleted |
| `letIsUnion` | binding rep is `union` | 3,689 | 265 | deleted |
| `letIsStruct` | binding rep is `struct` or `variant` | 3,131 | 65 (+2) | kept, D15543 |

**`letIsClosure`.** The two disagreements are D14843 and its emit-error test, both refused at
monomorphize. Under the ruling that a refusal may only stay loud, the typed reader takes the one
call site. The sweep reports 23,610 same: both programs keep their message.

**`letIsUnion`, 265 calls in two classes.**

* 260 calls, all pre-monomorphize (`passes`), over 63 programs. These are generic template
  bindings whose type is open, so the typed rep is `null` and the old ladder said `union`.
  Witness: D2915, `const r = if c { a ?? 5 } else { b }` in `g0<T>`. Nothing reads a
  template's cell, so no program moves.
* 5 calls, D14640: an instance's `string | K | null` binding that the ladder missed (old
  `false`, typed `union`).

All seven call sites (in `letInitCellKind`, the captured-slot index and `exprUnion`'s global
and capture rungs) read `letBindRepKind(..) == "union"`. The sweep reports 23,611 same.

**`letIsStruct`.** 2 calls are typed `variant`, which the struct arm turns into `variant`
anyway (`hole-optional-member-read-record-union.vl`). The other 65 are all one class, at module
scope: a binding of a nullable record that holds a generic function value. An example is
`const ar = a["k"]` over `Map()` of `{ f: id }`. The typed rep `nulstruct` is right, and the
ladder's `struct` is wrong: the missing-key `null` traps (**D15543**, clause 1). The typed claim
declines because `TyFunc` has no quantifier: `id`'s own `T` reads as an open type variable, and
`bindCellGo`'s `tyHasTyVar` guard returns no claim. Trial results:

* `letIsStruct` replaced by the typed reader: 15 `runs → not-runs` and 6 new compiler traps,
  because the present-key reads that run today lose their cell.
* The guard lifted at module scope: `repSlotOfKind` picks the `{f:i32}` row, and the module is
  invalid wasm.

What is missing is the fact that a type variable belongs to a function value's own scheme.

**Not done.** `letInitCellKind` stands, since `letIsStruct` is one of its rungs.
`emit_closure_sites.vl` also calls `letIsStruct`.

**Proof.** Every seed is a fixpoint (two refreshes, byte-identical).

| change | base seed | candidate seed | sweep: same, movers, runs lost |
| --- | --- | --- | --- |
| `letIsClosure` deleted (before the merge of master) | 6,451,947 | 6,451,790 | 23,610, 0, 0 |
| `letIsUnion` deleted (master `30d4bfd2`) | 6,454,614 | 6,454,189 | 23,611, 0, 0 |

On the census, `letIsUnion` (1,636 pre and 2,556 post calls) leaves, and the probed classifiers
go from 106 to 105. `letIsStruct`'s pre calls go from 2,064 to 2,352, because template bindings
that used to stop at the union rung now reach it. `letInitCellKind`'s pre calls go from 1,632
to 1,596.
