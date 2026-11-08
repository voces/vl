# Identity typing (A): the declined decisions keyed (2026-11-07)

Follows [slice 2b](2026-11-07-argument-keyed-instances.md) and the consumers (#6726, #6736). At
mono's 1,577 callback-specialization decisions, the elaboration declined 105: 77 `open` and 28
`nobase`. This PR keys 103 of them. The consumers read the key wherever there is one, so the
bake, the (S1) map, the hole binding and the seed binding now serve those decisions too.

## Measured first: why each was declined

Population: the 23,453 programs of the shadow note, `$VL_ID_SHADOW=1`, with a temporary
reason row at each decline.

| declined | decisions | what the argument or call was |
|---|---|---|
| `open`: an `Ident` whose type has type variables, at the root | 59 | a read of a generic or hole declaration (`apply(neg, 2.5)`, `mid(same, same)`) |
| `open`: the same, inside an emitted function | 15 | the same, in a frame |
| `open`: a hole lambda with no type in its frame | 3 | D14729's `(n) => n * 2` |
| `nobase`: a mono clone of a keyed call | 26 | the frame has a key. The clone's call node has none, and the call it copies (`nodeSrc`) is keyed from that same frame |
| `nobase`: the clone's source is keyed from another frame key | 1 | `take(g)`'s `h(...)` with `h = g`, renamed to `app2` (`closures/generic-returned-fn-param.vl`) |
| `nobase`: a mono-minted call with no source | 1 | a UFCS overload-set clone (`modules/generic-ufcs-overload-set`) |

None was a call the elaboration never reached or a module-level call. 27 of the 28 `nobase` are
calls under mono's clones, and the elaboration keyed the source call of 26 of them.

## The two changes

- **`elabSpecArgDecl`.** Where the identity type has type variables, or the argument has no
  type, the component is the declaration the argument reads or is (`idSetOf`, the shadow's
  rule). It no longer comes from the set that type carries, which is the generic machinery's.
  A tagged set is still refused first. A function value's own scheme and an enclosing frame's
  open variables both reach this path, and both name one declaration.
- **`elabSpecBaseOf`.** A call node the elaboration never keyed reads the call it copies
  (`elabCallKeyedSrc`, up the `nodeSrc` chain). This is the same fallback `elabTyIn` uses for a
  clone's node type.

## Graded

| | before | after |
|---|---|---|
| keyed | 1,472 | **1,575** |
| `open` | 77 | **0** |
| `nobase` | 28 | **2** |
| tagged | 0 | 0 |
| distinct instances: mono / elaboration / pairs | 1,416 / 1,416 / 1,416 | 1,499 / 1,499 / 1,499 |
| programs whose grouping disagrees | 0 | 0 |
| nested children | 55 | 60 |
| mono's instance count | 25,045 | 25,045 (no program moves) |

No decision keyed before lost its key: the 103 new keys are exactly the 77 + 26 declines.

## Sweep

Fixpoint seeds on both sides. `scripts/sweep.vl` diff against master `756faab3`:
- 23,608 same, 5 bytes-only movers, 0 output movers;
- 0 `runs → not-runs` and 0 new traps.

All 5 movers have one shape: a call through a newly keyed parameter's annotated binding
(`let b: F = a1; b(3)`, D6740). Mono's alias walk refuses that binding, while the keyed bake
rewrites the call. A `call_indirect` becomes a direct call, and the output does not change. The
movers are `typaram-binding-seeded-from-another-typaram.vl`, `typaram-binding-seeded-in-cloned-call.vl`
and the witnesses of D6740, D15495 and D15527. #6726 found the same class at 3 calls.

Seed: 6,492,294 → 6,492,619 bytes (+325).

## Parked

The 2 remaining `nobase`. In both, mono rewrote the call itself:
- In `app2`, the frame resolves to key 0 while the source call is keyed only from key 5, which
  instances the same declaration.
- The overload-set clone has no `nodeSrc` to map back to.

Each needs a key-refinement answer for mono-renamed calls, which is not this lane's.
