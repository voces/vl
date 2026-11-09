# Step 2: the `spelled` builds, the hole-function pins and the body reads that stand

Base: master `5c46eb2b` built to a fixpoint (6,572,040 bytes). Population for the shadow counts:
the 7,646 `tests/cases/**/*.vl` files, each built once (`VL_ID_SHADOW=1 vl build`). Counts are
instance builds, registry hits or operand reads. The `ckey` row now ends with `name@pos`.

## 1. The 42 root lambdas and the 7 hole functions: the checker already gave the type

A probe printed each `spelled` build's caller and its checked signature beside mono's pins.

| class | builds | site | what the checker has |
|---|---|---|---|
| closed lambda, pins = its signature's parameters | 26 | value delivery, call, capture cell | one type, so no instance |
| hole function the checker closed, pins = its signature | 6 | call | one type, so no instance |
| open hole lambda pushed onto a list in another function | 14 | capture cell (`monoCellLamTake`) | `(_) => void`, no instance |
| lambda bundle at a hole parameter | 1 | value delivery | an instance; the pin is a set |
| lambda at a union-typed field, typed by the field's union | 1 | capture cell | `((i32) => K0) \| f64` |

All 42 builds are reached: each one is the value a call, a delivery or a cell reads, so none
is deleted. The elaboration mints an instance only where a signature has something to bind
(`elabEnqueueAtParams`). A declaration whose checked signature is closed has one type and needs
no instance. Mono still builds it because an un-annotated parameter makes it a template
(`monoIsGenericDecl`). Its pins were that one type at all 32 such builds. So mono decided no
type, but its key was its own spelling.

**The change.** If nothing else keys a build, and every pin is `tySame` as the parameter of
the checker's closed signature (`elabClosedSigAtPins`), the build is keyed
`"S" + instKeyCanon(origFe, sig, …)`. The `S` prefix and the signature take the place of the
elaboration's key.

| path, shadow `ckey` | builds before → after | hits before → after | typed hits |
|---|---|---|---|
| `sig` | 0 → 39 | 0 → 16 | 0 → 0 |
| `spelled` | 79 → 40 | 32 → 16 | 2 → 2 |

`sig` holds 39 builds, not 32. The other 7 are rep-twin rows (`soundness/built-container-*`,
`*-wider-*`) whose pins are the declared type, and they are the build at that type. The builds
merged or split nowhere, and the sweep shows every module byte-identical.

The 40 `spelled` builds that stand:

- **TYPE, 14**: a list's function set does not hold a lambda that another function pushes onto
  it (`hole-fn-into-pushed-lambda-*` and two siblings; D12940's shape). `f(snd)` binds `g` at
  `(string, i32) => i32`, and no instance records that member. Owner: the set (step 3).
- **TYPE, 1**: `closure-result-map-union`'s `(q0) => "lbbzv"`, typed by its field's union.
- **REP, 25**: 17 annotated functions built again at a container's wider rep
  (`built-container-*`). Then 6 at a wider record row (`J`, `V`). Then `z` at its stub signature,
  and the lambda bundle. These are rep twins (step 7).

## 2. Body reads: no narrowed read is left

`monoPinnedOperandTy` already returns the elaboration's type wherever that type is closed
(#6932), and that covers the narrowed reads. The reads that still fall back to the pin, shadowed
at the fallback:

| why | reads | pin against `elabNodeTy` |
|---|---|---|
| open: the elaboration's type is open too | 78 | 51 the same open type; 27 `i32[]` against `((_) => _)[]` (a tagged list's id rep) |
| root: no instance being walked | 4 | `pins`-path lambda builds that `elabDemand` declines (`noinst`) |

The 51 are equivalent, the 27 are rep (step 7), and the 4 have no instance to read.

## 3. What mono still decides

| family | count | TYPE or REP | why it stands |
|---|---|---|---|
| argument row arms (`monoArgRowArmTy`) | 1 site | rep | step 7 |
| closed-type spelling, union registration | 7 + 4 sites | rep | step 7 |
| `monoElabPin` spelling and delivery | 5 sites | rep | the type is `elabCallParamTy` |
| `monoKeyPinSeg`, `sig` path | 39 builds | type, the checker's | keyed by the closed signature (§1) |
| `monoKeyPinSeg`, `spelled`: pushed list members | 14 builds | type | no instance for a pushed member (step 3) |
| `monoKeyPinSeg`, `spelled`: union-typed lambda | 1 build | type | the checker records the destination's type |
| `monoKeyPinSeg`, `spelled`: rep twins and sets | 25 builds | rep | step 7 |
| `monoKeyPinSeg`, typed dedup | 359 hits at #6928 | rep | step 7 |
| body reads, pin fallback | 78 + 4 reads | rep / equivalent + type | §2 |
| instance no-answers | 14 | type + rep | named in #6927 and #6928 |
| late demands on refused programs | 2 | type | #6928 §2 |

Every TYPE row is at zero or carries a named reason: an instance the elaboration does not yet
record (15 builds, 4 reads), or a reading the checker declines (2).
