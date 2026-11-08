# Step 3: the function-holding fact, the split arm, and the Closes list re-graded (2026-11-08)

Lane "finish step 3". Master `113b2740`, base and candidate both fixpoint seeds.

## The seven blocked node-type functions

"Fn#d function-holding fact (7 blocked)" is the `node type` family's `blocked` column in
[the evening census](2026-11-07-exit-census-evening.md). The fact is `elabHeldValTy`
(`emit_elab.vl`, [producer](2026-11-07-fn-holding-facts.md),
[consumers](2026-11-07-heldval-consumers.md)). Today, read from the code:

| function | today | what mono still decides |
|---|---|---|
| `monoClosedObjLitTy` | deleted with the consumer switch | — |
| `monoClosedFieldValTy` | deleted, no reference left | — |
| `monoCloseRetFnTy` | reads `elabHeldValTy` always | nothing |
| `monoPinReturnedObj` | `elabHeldValTy`; a generic instance's copy takes it alone ([D15297](2026-11-08-returned-record-held-type.md)) | `monoObjLitFieldsPin`, where `idSlotHeldTy` declines a non-generic literal |
| `monoRetFnListTy` | `elabRetTaggedJoinTy`, then `elabHeldValTy` ([guard (b) gone](2026-11-08-held-type-keeps-fn-sets.md)) | `monoRetLitElemTy`, where the reader declines: D4515, one list read at two types (a per-read instance, not a closed type) |
| `monoArgClosedTyIn` | `elabArgDeliveredTy`, then the identity type | the pin, where neither answers. It was never an Fn#d fact: [a rep fact](2026-11-07-blocked-three-vs-identity.md) |
| `monoCoerceListCbArg` | `elabCbArgSig`, then `elabIdentityFnTy` | a tagged set (D9761) and a generic choice with no instance at the element: set facts, step 4 |

So the singleton half of the fact is recorded and read. The residue is sets and per-read instances,
which are step 4's. The fallback counts were not re-measured here. The dated counts are in the
linked notes.

## `judgeFnArgHoleCalls`' split arm

The arm the target doc cites was `if insts.length > 1 && !noSplit { holeFnSplitAt(...) }`
(`check_calls.vl` at `de65aca5`). It went with fn_split (#6402). What `insts.length > 1` still
guards is the per-instance judgement (`judgeHoleCallOps`) and `reassignedFnValueErr`, a refusal
for a reassigned binding. That binding holds a set, so it is step 4's.

fn_split's limit survived next door. `pinHoleLambdaVals` took `noSplit` (named arguments, or a
defaulted parameter left out) and refused a lambda called at two types with `cannot infer a type
for parameter`. A declared generic ran at both spellings. This PR deletes `noSplit` and
`callLeavesDefault`, and renames `holeLambdaSplit` to `holeLambdaAtEachInst`. Pinned by
`functions/hole-lambda-literal-at-two-instances-named-or-defaulted.vl`.

## The Closes list, re-graded on the candidate

The w00 family has no filed rows. These are the [witness note](2026-10-25-evidence-witness-family.md)'s
spellings, rebuilt, so read them as reconstructions:

| witness | today |
|---|---|
| w00, w02, w03, x02 (lambda), x03 (nested function), x01 (annotated) | run |
| x04 `apply2([h][0], 5)`, x05 `if b {h} else {h}`, y05 `call0([h], 5)`, y06 `callF({f: h}, 5)` | refuse. Each is a list, an if or a field, so a join position (step 4) |
| x06 `const k = pass(h)`, y03 `pass(h)(5)` | refuse at emit, `monomorphize: unsupported argument type for f` |

Each refusing spelling also runs as its top-level twin. y05 refuses in the checker even at one
type: filed as [D15565](../inventory/D15565.md).

D13860, D13660 and D13720 grade as filed (runs). The open rows of the four sub-groups that hold a
single function (D10382, D12211, D12218, D14883, D14888, D15014, D2621) all grade as filed (open).
D10382 is x01 with a hole parameter in between. Letting a hole that flows into two function types
stay a hole (`check_fn_decl.vl`'s solve) passes check and then refuses at emit with x06's
message. That trades a check reject for an emit reject, so it was reverted. The emit half is
mono's hole-binding lane.

## Can step 3 be marked done?

No. Three things stand. (1) The Status row says the `genFnHole*` family is gone, but all six
functions the doc cites at check_relate_core.vl:3977–4193 are on master, five of them exported.
They are the checker's per-call instance judgement, which "calling `Fn#d` instantiates `d`" replaces.
(2) A singleton through a returned value, `pass(h)` (x06, y03), refuses. (3) D10382 is open. The
rest of the Closes list is join-shaped and belongs to step 4.
