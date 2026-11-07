# Identity typing (A), slice 3: the callee inside an argument-keyed instance (2026-11-07)

Slice 3 of the [argument-keyed instances design](2026-11-07-argument-keyed-instances-design.md),
on [slice 2b's instances](2026-11-07-argument-keyed-instances.md). It is a shadow: nothing reads
the fact, and mono's derivation stays.

**The fact.** `elabCalleeFnsAt(call, k)` (elab_fn_id.vl): inside argument-keyed instance `k`, a
call whose callee is specialized parameter `ps[i]` is a call of `ds[i]`. A callee that is a
binding only ever holding that parameter counts too, through chains (`const v = a; const w = v;
w(x)`, D12216). Anything else gets `elabCalleeFnsOf`'s answer.

**Shadowed against mono's derivation.** Mono's derivation is `monoBakeCallback`, which rewrites a
call through a baked parameter into a by-name call. At each such rewrite, the `specbake` row
compares the function mono names with the fact at the instance that decision keyed. The unit is
one rewritten call site per fresh mono instance. The hub note counted its 1,052 mono-only calls
at `monoWalkIdentCall`, per call per instance, so that is a different unit.

Population: the 23,450 programs, `$VL_ID_SHADOW=1`. 1,230 rewrites in 261 programs.

| fact at the key | before (`elabCalleeFnsOf`) | rewrites |
|---|---|---|
| agree | no answer | 1,166 |
| agree | another function | 6 |
| no key (the decision was declined in 2b) | no answer | 36 |
| no key | another function | 16 |
| no key | several | 6 |
| **differ** | | **0** |
| no answer under a key | | **0** |

All 1,172 rewrites in a keyed instance agree. 1,166 of them are calls the elaboration could not
answer before, which are mono-only calls. The 58 without a key are the decisions 2b declined:
type-variable and hole-lambda arguments, and calls with no elaboration instance.

**Not covered:** a call through an element of a parameter (D10320's `a[1](z, 2)`). It is
mono-only too, and the bake never rewrites it.

**Flags off**, with fixpoint seeds on both sides: `scripts/sweep.vl` against master `98f8879a` (slice 2b merged) reads
23,610 same, 0 movers, 0 `runs → not-runs`. Instances do not change from 2b. Seed:
6,465,519 → 6,467,394 bytes (+1,875, +0.03%).

**Which mono readers these facts replace** (for the consumer lane):
- `monoBakeCallback`'s per-parameter rewrite, which is the direct callee behind
  `monoWalkIdentCall`'s mono-only calls: `elabCalleeFnsAt(call, k)`, with `k` from
  `elabSpecDemand`.
- `monoWalkIdentCall`'s (S1) reverse map, from a source declaration to its clone in a
  specialized instance: the pair (`elabSpecInst`'s key, `elabSpecDeclAt(k)`). Mono's registry
  entry for that pair is the row `elabSpecMonoGroup` already records at every decision.
- `monoHoleBinding` and `monoBindSeededTyParams`: no new fact. An argument-keyed instance copies
  its base instance's binding, so they read the binding of `elabSpecBaseOf`'s instance as before.
  The 105 declined decisions keep mono's derivation.
