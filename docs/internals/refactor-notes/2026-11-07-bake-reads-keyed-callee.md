# Identity typing (A), consumer 1: the bake reads the keyed callee (2026-11-07)

The first consumer of [slice 3's fact](2026-11-07-argument-keyed-callee.md). The order is the
orchestrator's: the bake first, then `monoWalkIdentCall`'s mono-only calls, then the hole binding.

**What changes.** `monoBakeCallback` rewrites a call through a specialized callback parameter
into a direct call. It now takes the elaboration's argument-keyed instance of the decision it
bakes for, `elabSpecKeyOf(specAt)`. The concrete path passes the key directly. The generic path
passes it through `monoBakeSpecK`, which is saved and restored around `monoMakeInstance`.
- **A keyed bake:** a call is rewritten only where `elabSpecParamCalledAt(call, k)` names a baked
  parameter, and that parameter picks the name. Mono's derivation (`monoBakeAliasParam`, the
  block-shadow guard, `monoReadsOwnParam`) does not run.
- **An unkeyed bake** (one of the 105 declined decisions): mono's derivation, unchanged.

`elabSpecParamCalledAt` and `elabCalleeFnsAt` share one walk (`idSpecSlotAt`). Slice 3's
`specbake` shadow row (`elabSpecBakeNote`, `idBakeClass`, `idSpecLast`) is deleted. The bake no
longer reads the latest decision as ambient state.

**Graded before the switch.** Population: the 23,450 programs of the shadow note, at
`$VL_ID_SHADOW=1`, with a temporary row at each keyed bake comparing the two answers in both
directions. A row counts each call either side would rewrite.

| at a keyed call | calls |
|---|---|
| both rewrite, to the same parameter | 1,173 |
| only the elaboration rewrites | 3 |
| only mono rewrites | **0** |
| they name different parameters | **0** |

The 3 elaboration-only calls are bindings that only ever hold the parameter, but that mono's alias
walk refuses: an annotated `const b: F = a`, or a written `let w = a; w = a`. One is in each of:
- `generics/type-param-binding-seeded-from-unannotated-param.vl`
- `closures/alias-of-fn-param-litunion-arg.vl`
- `closures/generic-fn-value-demand-other-generic-same-tyvar-name.vl`

Each one is now a direct call instead of a `call_ref`. Each program's module changes, and its
output does not.

**Decisions, unchanged:** 1,577 = 1,472 keyed + 105 declined (77 `open`, 28 `nobase`, 0 tagged).

**Flags off**, with fixpoint seeds on both sides: see the PR for the `scripts/sweep.vl` diff
against master.
