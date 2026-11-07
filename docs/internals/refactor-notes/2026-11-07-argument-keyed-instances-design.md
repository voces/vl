# Argument-keyed instances: design note

Moved verbatim from [architecture-target-2026-10.md](../architecture-target-2026-10.md) §3.4 on 2026-11-07; its `§` references are to that file.

#### Argument-keyed instances: design note (2026-11-07, for a ruling; nothing built)

Five parked items share one missing fact. An instance key that says which function a function-typed
argument is:

| item | count | what is missing |
|---|---|---|
| callback specialization's direct calls | 1,052 calls (23,456 programs) | in 940 the call sits in an instance the elaboration has no key for, and in 108 more the callee read has a type but no `Fn#d` set |
| keyless generic instantiations, the hub's `gen\|nokey` rows | 5,256 agree, 249 mono-only, 4 several | the elaboration answers the callee but cannot key the instance; one known part is the 96 specialization groups below |
| the hub's (S1) | 122,691 agreeing decisions | a reverse map from a source declaration to its clone in an instance |
| `monoPinnedTyParamCanon` | 231 differ, 101 mono-only, 144 elab-only (programs) | **not this.** The differences are names (alias or literal union against its base), not values |
| reach's escaping-list helper, D15010's `use` | 1 program | **a constraint, not a client.** One helper instance has to serve holders of different sets |

**The key already exists in the types.** §2.2 gives a function value its identity, a singleton
`Fn#d` or a finite set. The elaboration keys an instance by `(decl, closed type arguments)` and
erases a function-typed argument to its structural signature, so `len<i32>(() => 4)` and
`len<i32>(() => 5)` share a key. The proposed key keeps that component as the argument's identity
set where specialization applies:

  `(decl, closed type arguments, for each specialized parameter p: the Fn#d set p's argument carries)`

Inside such an instance, a call through `p` is a call on a singleton, which §2.2 already types as a
direct call. That is mono's callback specialization, stated as the elaboration's rule.

**Mono keeps the policy.** By the 2026-11-05 ruling, specialization is mono's component of the key:
it changes no meaning, only how the code is built. So the split is:
- *which* parameters are specialized is decided by one mono predicate, the unified
  `monoSpecializableCallbackName`, with its two callers' gates (`viaWritten`, `monoReadIsAssigned`)
  folded in first, as that ruling required;
- *what* the component holds, the argument's identity set at the call's key, comes from the
  elaboration (`elabFnSetOf(elabNodeTy(arg, k))`).

A tagged set is never specialized. That is D15010's constraint: a tagged id is its member's
declaration index in every set, so one helper serves every holder, and keying it by set would
split it.

**What it unblocks, with counts:**
- **The 1,052 mono-only calls**, directly. Each sits in an instance that would now have a key, so
  `elabCalleeFnsOf` answers it. The upper bound is the 940 untyped calls plus whichever of the 108
  untyped-set calls are specialized arguments.
- **The specialization share of the 5,256 keyless generic rows**, which is at least the 96 groups
  measured on 2026-11-05. The rest (a template's only instance, a lambda, a hole function solved
  closed) are already keyed by their declaration and are untouched.
- **The hub's (S1) reverse map.** A clone in an instance becomes the pair (instance key, source
  declaration), the elaboration's own name for it. Mono's table from that pair to its slot is the
  map (S1) waits on.
- **Not unblocked:** `monoPinnedTyParamCanon`, which waits on the key settling names, a separate
  question.

**Smallest first slice: a shadow, no behaviour.**
1. Fold the two gates into the one predicate, byte-identical.
2. At each instance mono specializes, record the proposed key, using the elaboration's identity set
   for each specialized argument.
3. Grade 1:1 against mono's specialized instances: every specialized argument has a singleton set,
   and the proposed key groups mono's instances the way mono's `@name` suffix does (the 96 groups).

Slice 2 makes the elaboration enqueue and re-check instances at those keys. Slice 3 switches
`elabCalleeFnsOf` inside them, which retires mono's derivation for the 1,052 and gives (S1) its map.
Each slice is graded on the byte sweep.

**Ruling** (coordinator, 2026-11-07). The design is approved, on three conditions:
- **The instance count is a graded number.** The proposed key groups exactly as mono's `@name`
  suffix does, no more instances and no fewer. Every slice reports the instance-count delta, and
  any growth stops the work.
- **A tagged set is never specialized (D15010).** This is an assertion in slice 1's predicate.
- **Each slice comes back for a ruling before the next.** Slice 1 is approved: fold the gates
  byte-identically, then record and grade the key.

**Slice 1, measured: the identity this needs does not exist yet** (2026-11-07, 23,456 programs).
The gates are already one predicate on master, so there was nothing to fold. At each of mono's
1,573 specialization decisions, the specialized argument's identity set, read at the call's key or
else from its checked type, came out as:
- 70: a singleton naming mono's `@name`;
- **1,500: a type with no `Fn#d` set;**
- 3: no type at all;
- 0: a tagged set, so D15010 holds as an invariant.

The callbacks mono specializes are known, non-capturing, non-generic functions and lambdas. Today
`elabFnSetTy` holds sets only for the function values the elaboration tracks: generics, hole
functions and written slots. A plain concrete function value keeps its structural type.
**Prerequisite:** argument-keyed instances need identity typing for concrete function values
first, which is option (A), §2.2 applied to every function value. That changes every function
value's type in the checker, so it is an owner-level design item, and it joins the open
questions. Keying on the argument's declaration directly (B) is declined: it moves spelling, not a
decision. Slices 2 and 3 wait on (A).
