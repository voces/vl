# Identity typing (A), slice 2b: argument-keyed instances (2026-11-07)

Slice 2b of the [argument-keyed instances design](2026-11-07-argument-keyed-instances-design.md),
built on the fact of [slice 2a](2026-11-07-identity-typing-fact.md).

**What it builds.** At each of mono's callback-specialization decisions, the elaboration keys and
checks an instance at

  `(decl, base instance, for each parameter mono bakes: the declaration its argument is)`

- *which* parameters: mono's predicate `monoSpecializableCallbackName`, unchanged;
- *what* the component holds: `elabSpecArgDecl(arg, frame)`, the singleton of
  `elabFnSetOf(elabIdentityFnTy(arg, frame))`; a tagged set is refused (D15010), and a type with
  type variables is declined, since the set it carries is the generic machinery's, not an identity;
- the base: `elabCallInstFrom(call, elabKeyAt(frame))` for a generic, the root's typing for a
  concrete function (`elabSpecBaseOf`).

`elabSpecInst` (emit_elab.vl) mints the key and checks the body there. No existing reader sees
these instances: no by-declaration note, no reach note, and a diagnostic the re-check raises is
not the program's. Mono makes the call from two hook lines (`elabSpecDemand` after each
`cbFnNames` loop) and names the instance it chose with `elabSpecMonoGroup`. The instances are
minted after `elabRun` returns, because mono's predicate decides them. They, and the keys
checking them mints, are kept out of `elabLateNames`, so the late-demands gate does not count
them; `elabSpecMintedCount` and `elabSpecChildCount` do.

**Graded at every decision.** Population: the 23,450 programs of the shadow note, `$VL_ID_SHADOW=1`
(rows `speckey` and `specgroup`, `elab_fn_id.vl`).

| decision | count |
|---|---|
| keyed | 1,472 |
| declined: a type with type variables, or a hole lambda with no closed type (`open`) | 77 |
| declined: the call has no elaboration instance from its frame (`nobase`, 16 programs) | 28 |
| declined: a tagged set | **0** |
| total | 1,577 |

The decision count is 1,577 at this head, against 1,590 in the shadow note at `df635dbd`.

**Instance count: the grouping is exact.** Over the 1,472 keyed decisions, mono's registry names
**1,416** distinct instances, the elaboration mints **1,416**, and there are **1,416** distinct
(mono, elaboration) pairs. So the key groups exactly as mono's `@name` suffix does, with no
instance more or fewer, in all 369 programs that specialize. Mono's own count is 25,038, the
same as before. The mono side reads the registry entry the decision made, not the callee's name:
same-named callees in different scopes, and calls through a written `let`, made a name-based
reading look like a split.

**Nested instances.** Checking the 1,416 bodies keys 55 nested declarations (lambdas in a
specialized body, for example `fold`'s `(x: T) => k(x) + 1` in
`generics/recursion-at-same-type-runs.vl`) under the new parent, in 17 programs. They are the
elaboration's copies of the lambdas mono clones into its `@name` instance. Mono's count for
those does not move; the elaboration's does, by 55.

**Flags off**, with fixpoint seeds on both sides: `scripts/sweep.vl` diff against master
`c3345561` reads 23,610 same, 0 bytes-only, 0 output movers and 0 `runs → not-runs`.
Seed: 6,451,734 → 6,458,826 bytes (+7,092, +0.11%). `scripts/gate.sh`: all rows pass.

**For slice 3.** The key's components are `ekSpecPs[k]` and `ekSpecDs[k]`. Inside such an
instance, a call through parameter `ps[i]` is a direct call of `ds[i]`.
