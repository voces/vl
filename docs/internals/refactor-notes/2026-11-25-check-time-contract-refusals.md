# Moving #10162's emit-time contract refusals into `vl check` — 2026-11-25, lane SOUND

The coordinator asked SOUND to move each design refusal that is raised only at emit time into the
checker, where the checker can decide it exactly, so that `vl check` stops accepting what the build
refuses. The emit-side raise stays as the backstop. Three candidates were tried. **None can be moved
exactly.** This note records why, so that nobody retries them on the same plan.

The right home for a check-time raise is the end of `elabPrepare` (emit_sections.vl): a refusal
raised there (`emitFail`/`emitFailAt`) is reported by `vl check`, as D17620's witness shows. Every
attempt below was prototyped there and then discarded.

## Set-split call, sentence 2 (D16747) — needs mono's instance closure

`callRefSplitKind` returns 2 when `closureCallSetSplits(nodeTyAt(callee, fnIx), elabSrcDecl(fnIx))`
holds at an emitted instance. At `elabPrepare`, the witness
`closures/error-set-of-split-results-held-as-closures.vl` types its call's callee `(_) => _` under
its one elaboration key (`elabNodeTy`), and checks it as `_`. Only mono's substitution closes it, and
`closureCallSetSplits` declines a type that holds a type variable. A check-time version would have
to re-derive mono's instance closure.

## Set-split call, sentence 1 (D15926) — the predicate holds where emit takes another route

`fnTagCallSplits(c) && !fnTagSetIsTagged(fnTagCallSetOf(c))` over `fnTagCalls()` is decidable once
the tag rounds in `elabPrepare` settle, and it does move [D17013](../inventory/D17013.md)'s witness
from emit reject to check reject. It also refused [D16875](../inventory/D16875.md)'s witness, which
runs. That call meets the predicate, but the emitter lowers it by a route that never reaches
`callRefSplitKind`. The predicate is a necessary condition, not the emitter's condition: deciding the
route is emit planning.

## A generic function taken as a value no call fixes — the exemptions are mono state

`fnValueArmOf`'s `"unfixed"` arm (wasmEmit.vl, mirrored in emit_mono.vl's argument pin and the IR's
read) refuses unless `vrValueInert`, `elabValueSlotUncalled`, `monoStubValueOk` or the stub write's
right side exempts the read. `monoStubValueOk` reads `monoRetCopyReads` and `monoStubSlots`, and `fe`
is a mono `fnStmts` slot. Before mono, a check-time version can only refuse more than the build.

## Not tried

#10162 already names these two as emit-plan or rep facts, which by construction the checker cannot
decide exactly:
- the assignment used as a value with no arm
- the fresh-`Map()` record field

The soft-twin test is decidable only with explicit type arguments; its witnesses use none.
