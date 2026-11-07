# Identity typing (A), slice 2a: the fact in the elaboration (2026-11-07)

Slice 2a of the argument-keyed-instances design. It turns the identity shadow of
[2026-11-07-identity-typing-shadow](2026-11-07-identity-typing-shadow.md) into an elaboration fact.
`compiler/elab_fn_id.vl` holds the shadow's rules, which are unchanged:
- a lambda literal, or a read of a declaration, is `{d}`;
- a written `let` is the union of its writes;
- a value `if` or `match` is the union of its tails;
- a parameter, a field or a call result is open.

`elabIdentityFnTy(x, frame)` is `elabIdentityTy` with that set attached. For a concrete function type
that carries no set, it returns a copy of the signature whose `elabFnSetTy` entry is the set
(`elabFnSetTyMint`, minted once per type and set). So `elabFnSetOf` answers the identity. The copy has
the same structure, so it prints as the function type. The shadow now grades this fact rather than its
own private copy, and nothing else reads it yet. Slice 2b is its first reader.

**Where the fact lives.** It is in the elaboration's type of a node, after the check. It is not in the
checker's node type. That placement was measured first (variant A below) and refused.

**Variant A, refused: the singleton in the checker's node type.** `checkIdentNode` and the lambda arm
returned a minted `Fn#d` copy for every concrete function value. Swept against a one-level master
seed, 40 of 23,610 programs moved:
- 16 `runs → not-runs` and 3 new compiler traps;
- examples: `hole-param-literal-*` refused with `argument 1: expected K, got string`,
  `lambda-comparator-into-generic-call` lost `sorted`'s return binding, and
  `fn-value-adapter-at-wider-type` failed with an indirect call type mismatch.

About 30 consumers of `elabFnSetOf` (check_relate_core, check_assignable, check_fit_rules, emit_elab)
read a set as "instantiate each member at the call's argument types". That is right for the generic
and hole sets they were written for, and wrong for a concrete member. Moving the fact into the
checker's type means auditing those readers one at a time. It is not a slice of this lane.

**Graded at mono's 1,590 specialization decisions.** Population: the 23,450 programs of the shadow
note, `$VL_ID_SHADOW=1`, where the `today` column now reads `elabFnSetOf(elabIdentityFnTy(arg, ctx))`.

| today (the fact) | decisions | was (shadow note) |
|---|---|---|
| singleton naming mono's declaration | 1,505 | 0 |
| singleton naming another function | 82 | 82 |
| no type | 3 | 3 |
| no set | 0 | 1,505 |

All 1,505 decisions on a concrete argument now agree. The other 85 are not concrete values, so they
are outside 2a:
- the 82 have a type with type variables, and the set it carries comes from today's generic machinery
  (for example `run(v, 2)` where `v` holds `id`);
- the 3 are hole lambdas with no closed type outside an instance (D14729's `(n) => n * 2`).

There are 0 tagged sets (D15010). Instances: 25,038, unchanged.

**Flags off**, with fixpoint seeds on both sides: `scripts/sweep.vl` diff against master `f92d874b` reads
23,610 same, 0 bytes-only, 0 output movers and 0 `runs → not-runs`. The 224 joins on untyped-set values
do not move, because no output-affecting pass reads the fact yet. Seed: 6,436,623 → 6,438,389 bytes
(+1,766, +0.03%).

**For 2b.** The key component for a specialized parameter is `elabFnSetOf(elabIdentityFnTy(arg, k))`
at the call's frame. `elabDemandFrom` already carries per-parameter identity components (`byId`)
for parameters whose type has type variables. 2b extends that seam to the parameters mono's
predicate specializes.
