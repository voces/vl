# Mono's standing hazard, the parked hub, and B2's named bar

Moved verbatim from [architecture-target-2026-10.md](../architecture-target-2026-10.md) §3.4 on 2026-11-07; its `§` references are to that file.

**Standing hazard: the monomorphizer mutates the checked tree in place.** It annotates
un-annotated bindings, strips a nested generic's `fnTyParams`, and renumbers its function slots
(`monoGen`, `fnStmts`). So any fact asked after the walk can see the walk's mutation. A per-node
fact taken before the walk reads the tree the program wrote. An answer computed after the walk
can differ from it with nothing in the reader saying so. When a query-time answer disagrees with
an earlier one, look for a field the walk rewrote before looking for a missing edge.

`value_reach` is therefore still a live fact source for these readers, and its inert answer is the
next fact that needs an elaboration twin. It is not `elabSlotUncalled`. "Reaches no call" is one
half of it. The other half, "nothing observes its signature", is something `value_reach` answers
and the elaboration does not.

**`monoInertValues` is deleted; each share answers from its own source** (2026-11-07). A per-writer
census over 23,456 programs found the leaf mark is per value and the slot fact per slot. 40 leaf
values sit in a slot that is called, such as D10024's spread copy, and 105 sit in no binding slot.
So the shares split by where the fact comes from. The five readers ask
`vrValueInert(x) || elabValueSlotUncalled(x)`. The sources:
- **Uncalled slot (67 decisions).** `monoUncalledSlotFnTy` runs only under an `elabSlotUncalled`
  answer. It notes each value it builds with its slot (`elabValueSlotNote`), and
  `elabValueSlotUncalled` asks `elabSlotUncalledOmitting` of that slot when read. There is no copy
  in mono.
- **The flow rewrite's own output (leaf 440, call returns 8): `mfrInertValues`.** These are the
  values every delivering read of which `monoFlowReads` redirected to their generic. That is a fact
  about mono's own transformation, which the elaboration does not see. It is read only for
  inertness. A reader that used it to choose a type would be a decision leaking back into mono.
- **A pin that closes the value: `monoHeldInert` and `monoArgInert`.** `monoHeldValueAt` coerces a
  held value at its pin (89 decisions, stub only), and an inert parameter's argument is pinned at
  its stub (6). The pin is the source, and `value_reach` reads these values as live.

A clone copy takes its original's entry in each of them.

**Clone to source is `elabSrcDecl`.** Mono's instance choice is compared with the elaboration's
after mapping each lambda clone through `elabSrcDecl`. That mapping brings D3928's 21 differing
decisions to agree. `nodeSrc`, `declOrigOf` and `lfOriginOf` do not link an instance body's lambda
copies.

**The hub's callee choice is parked: its derivation duplicates an elaboration fact, and its policy
is mono's** (2026-11-07). `monoWalkIdentCall` picks a callee through eight rungs: arm, respell,
closure, the instance-origin hop, captured, readgen, alias-lambda and alias-let end. That choice
agrees with the elaboration's (`elabCalleeFnsOf`, with a lambda clone mapped by `elabSrcDecl`) on
**122,691 of the 122,722 decisions both sides answer**. The remaining 31 are the D5841 several-sets,
over 23,456 programs. Two things in the hub are mono's own:
- **The `call_ref` policy**, which calls may be made direct. Whether a rung fires is what keeps the
  2,079 elab-only calls `call_ref` (ruling (a); (S2), making a subset direct, stays declined), and
  the rungs' `monoNoRename` and written-let frame side effects are that policy.
- **Callback specialization**, recorded below.

What duplicates the elaboration is the rungs' derivation of which function is called. That
derivation is the endgame to move (S1). The rung would become a firing predicate, and the callee the
elaboration's single member. The move is blocked on a cheap reverse map from a source declaration to
its clone in an instance, because the elaboration names the source and mono needs the instance's
slot. The canonical-instance-key work is the expected provider. Moving it today would delete about
two functions (`monoRespellLamFe` and `monoCapturedLamFe` become predicates), so it waits for that
map.

**`monoCellCall`'s callee choice is parked on the same terms** (2026-11-07). The function a
capture-cell call instances can be the cell's lambda, a generic seed or a hole-lambda seed. Over
23,456 programs, `elabCalleeFnsOf` agrees on all 16 calls where mono picks one. In 366 calls only
the elaboration has a callee, and those stay `call_ref` under ruling (a). So the choice is mono's
`call_ref` policy and deletes nothing. Its other half, coercing the cell's writes at the instance's
signature, waits on the per-instance signature of a written binding, as the written lets do.

**The written-let decisions wait on the binding reader** (2026-11-07). Over 23,456 programs:
- `monoWrittenGenLetFrame`'s gate (every value names a declared generic) is not yet measured.
  The first shadow read the binding's set after the walk had retyped the node, so its 109 of 112
  is void. It reruns reading the set before the walk, once split-dep's set-valued fold over a
  let's writes lands (D4307).
- The type `monoCoerceWrittenLetTys` coerces at agrees with `elabSlotTyAt` on 18 of 166
  decisions. In 53 the slot fact is a wrong one: the initialiser fallback in `elabSlotInstFacts`
  stores a polymorphic identity, such as `other<V>`'s `(V) => void`, as the per-instance fact.
  split-dep is fixing that store so these become declines. In 95 it answers nothing.

`monoWrittenGenLetFrame`, `monoCoerceWrittenLetTys`, `monoArmWrittenLetSeed` and `monoLetSeedGenFe`
wait on both. `monoFlowKeptIndexElem`'s gate agreed on all 78 decisions and reads the indexed
read's identity set (`elabFnSetOf`).

**Mono-owned: callback specialization's direct calls** (2026-11-07). `monoWalkIdentCall`'s
instance choice was compared with the elaboration over 23,456 programs: 122,691 decisions agree.
2,079 are elab-only and stay `call_ref` under ruling (a). 1,052 are mono-only: 698 concrete and 354
generic. In every mono-only call the callee is a parameter or a parameter's element (D10163's `f()`,
D10320's `a[1](z, 2)`), which mono makes direct by specializing the enclosing function per argument.
The checker resolves none of them. The identity type `elabFnSetOf(elabNodeTyAt(callee, ctx))` names
mono's callee in 4. In 940 the call sits in a callback-specialized instance that has no elaboration
key, because the elaboration keys instances by types, not argument values. So this choice is mono's
own, a class (c) fact. An elaboration twin would need argument-keyed instances.

**B2's named bar: 16 programs the walkers' literal mechanics carry.** With the whole walker planner
off and the chain gate admitting callee reads, 7,538 sweep programs at fixpoint lose 16 runs and
move no output. These are the reads the gate does not answer: an argument handed on, a loop over a
literal, a spread or slice, a map store through a parameter. B2 replaces the planner's literal roots
with the chain walk's and must recover all 16:
- argument reads: `generics/fn-value-generic-copied-returned-or-aliased-handed.vl`,
  `generics/fn-value-generic-container-read-listed-or-stored.vl`,
  `generics/fn-value-generic-handed-from-call-map-or-repointed-let.vl`;
- spreads and slices: `closures/generic-list-spread-copy-written.vl`,
  `closures/generic-list-spread-copy-written-inside-function.vl`,
  `closures/hole-fn-generic-pushed-list-spread.vl`, `closures/generic-list-sliced-called-at-two-types.vl`,
  `closures/generic-list-to-unannotated-param.vl`;
- map stores through a parameter: `closures/hole-fn-generic-map-handed-two-maps.vl`,
  `closures/hole-fn-generic-map-stored-through-parameter.vl`;
- no call fixes the type: `closures/container-of-generic-flow-reads.vl`,
  `closures/hole-fn-generic-in-map-called-at-two-types.vl`,
  `closures/list-of-generic-element-called-at-its-stub-signature.vl`;
- `closures/hole-fn-in-record-field-at-field-call-instance.vl`,
  `closures/lambda-called-directly-with-generic-at-two-signatures-beside-one-signature-consumer.vl`,
  `closures/container-of-generic-read-positions.vl`.

Letting the elaboration also choose the candidates (option B) fails the soundness bar. Over the 7,538
sweep programs, with the gate "a `const` or unwritten `let` whose slot nothing writes later", 23
programs move output, lose a run, or build a refusal fixture. The gate still needs three facts:
- a callee's write into a container handed to it as an argument;
- the value a copy of a written `let` held when it was copied, which is a flow-sensitive fact the
  elaboration does not have;
- per-instance generic results.
