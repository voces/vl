# The per-call instantiation vector at check (STORE stage (a)), 2026-11-16

Coordinator ruling 2026-11-16: (c) now (late decider kept for a named residue, ratcheted by
`scripts/late-tags-baseline.txt`), (a) next. This note fixes (a)'s shape before anything is built.

## The fact STORE needs

Every class of the residue needs the same fact: which instance a call creates, and what each
parameter holds in it. That covers G (type arguments), P/N1 (a set forwarded through a literal or a
hole parameter), S (a written binding joined per instance), most of T (lambda members, sets reached
from generic or lambda bodies) and D16881 (the instance's closed callee signature, so the split-set
refusal moves to check). Today only the elaboration enumerates instances; the check approximates
them per set, which is exact only where the set is in the parameter's type.

## Shape (agreed with L2, 2026-11-16)

- **Key** = (callee decl, binding vector over the callee's type variables in a fixed order: declared
  `fnTyParams` first, then its parameter holes `?f.k`), interned to a `KeyId`. A per-parameter vector
  would miss a variable no parameter carries (`mk<T>(): T[]` called as `mk<i32>()` or pinned by its
  result). Parameter `TyId`s are derived: each annotation substituted by the vector.
- **Source**: what a call binds today, `callFtyPinCstrs`' `vNames`/`vTys` and `cstrPinBinding`'s
  `cNames`/`cTys`. An unbound variable takes `never` (`withUnboundAsNever`), in the key too.
- **Set components are types already**: a function-set type (`fnTagSetOfTy`), including inside a
  list or record literal's type, so a forwarded set is in the key once the argument is bound.
- **Relative keys.** Recorded from the body check only (`monoRecheckDepth == 0`, `!inferQuiet`), so
  a call in a generic or un-annotated body holds its caller's own variables. Its key under an
  enclosing key `K` is that vector substituted with `K`'s (`substTyDeep` under a `SubstCtx`). Mono's
  re-check does not run for every instance, so the closure comes from substitution, not re-check.
- **Open, not a key**: a call through a function value (hole callee, set) until S3.4d's arrow rule
  binds it; and a vector still holding an outer hole after substitution (an under-solved caller),
  which would otherwise mint a symbolic instance mono never makes.
- **Expected components beyond the bindings** (A0 names which one splits each elab-only pair):
  literal widening (`widenLitTy`, except a literal-union pin), the anonymous-record discriminator
  (`monoAnonPinDiscrim`), and any set or literal-union discriminator mono adds beyond the `TyId`.
- **Storage stays out.** `fnTagDecide` decides storage per (KeyId, function parameter); mono's
  identity is (KeyId, storage per function parameter), as §10 settles.

## Where it is recorded

- The vector: L2's table `instVecAt(call) -> (callee, names[], tys[])`, recorded at
  `callFtyPinCstrs` (L2 PR, identical, nothing reads it; A0's input). Hole-callee calls join at
  S3.4d through the arrow rows (`arArgs`).
- The closure is one module, `check_inst_keys.vl`. Its roots are the closed calls in non-generic
  bodies. Each key's body's calls are substituted with that key, to a fixpoint that ends by a visited
  set of interned `KeyId`s. The only depth bound is mono's own `MONO_NEST_MAX`, referenced rather
  than copied, so the check and mono stop polymorphic recursion at the same place. That is one
  walk-limit site at most, named in its PR. The closure runs once, at the end of check, before
  `fnTagDecide`.
- STORE's facts (`check_arrow_facts.vl`) are then keyed by `KeyId` instead of by set.

## When it is complete at check

After the whole-program check and before `fnTagDecide`: every call's symbolic vector exists once S3
covers the call's bound kinds. Until then a call whose vector is missing is marked open, and its sets
stay in the late residue (they are already rows in the baseline). Completeness is measured, not
assumed: stage A0 below.

## Stages

- **A0, shadow (identical).** Build the key closure at check; compare it with the elaboration's
  minted keys (`ekDecl`/`elabKeyOf`), per program: equal, check-only (would be extra instances),
  elab-only (incomplete at check, naming the component that splits the pair). It also counts open
  calls per reason (function value, outer hole), so S3.4d's effect is measurable. Printed under an
  env flag; nothing reads it.
- **A1..An, per class (graded).** `fnTagDecide` reads facts per key for one class; its rows leave
  `late-tags-baseline.txt`; that class's late branch goes. The last one deletes `fnTagRedecide`.

## Module-size measurement plan

Keying a forwarded set can split one instance into two (N1's shape). Measured at A0, before any
consumer: per program, distinct check keys vs elaboration keys, and the programs where check > elab
listed by name. Each A-stage then runs the A/B on all `@run` programs (wasm bytes, output) and
`plumb-shape-cost.vl --check`, reporting wasm movers by name and the total delta; a stage whose
growth is not paid for by closed late rows is stopped and reported.

## Ruling (coordinator, 2026-11-16)

Approved as written, with L2's correction. Order: L2's D16882, then `instVecAt`, then A0 (after
STORE's holder rule and residue guard). The size stop rule stands: an A stage whose growth is not
paid for by closed late rows stops and reports.

## Ownership (agreed)

L2 owns the vector (recording, substitution API). STORE owns the closure (`check_inst_keys.vl`) and
its consumers. H and L1 adopt `KeyId` later. Not S4: S4 generalizes inside an instance; this
enumerates instances.

Unblocks: G, P, S, N1, most of T in the late residue; D16881.
