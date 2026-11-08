# Step 2: the lambda-return pin and the delivery pin against the elaboration

Base: master `9e6c4a79` with #6902 merged, built to a fixpoint (6,571,683 bytes). Population: the
23,736 programs of `scripts/sweep.vl -- list`, each built once with `$VL_REP_SHADOW` by a scratch
seed that was never committed. Counts are answers at a site, not programs. This follows the family
table of `2026-11-08-step2-live-pin-shadows.md` (lambda pins; delivery and return).

## Shadow 1: the lambda return, `monoLamPinRetAnn` against the instance's lambda type

The shadow compares the return annotation's type `monoLamPinRetAnn` gives the clone with the
result of `elabWalkTy(fnIx)` (else the lambda's checked type).

| class | answers |
|---|---|
| same type index | 1,397 |
| `tySame` | 6 |
| elaboration open (`_`, `_[]`), pin closed | 48 |
| differ | 0 |

Wherever the elaboration closes the result, the pin agrees. That is by construction:
`monoLamElabRet` reads `elabWalkTy` first. The 48 are holes the elaboration keeps open and the pin
closes through the instance's binding (`monoSubstInst` over `bN`/`bT`) or the agreed kid return
(`elabWalkKidRet`). The rest of `monoLamPinRetAnn` decides which spelling the result takes and
whether to register its box (`monoRegisterValuePin`). That is a rep decision, step 7's. So the
TYPE half has nothing left to switch. It needs the 48 closed at the instance first, which is an
elaboration change.

## Shadow 2: the delivery, `monoDeliverAtPinTys` against the reader and the recorded delivery

The shadow compares the pin type `monoDeliverAtPinTys` coerces a function value to (where no stamp
closed it) with `elabNodeTyOrChecked(v, ctx)` and `elabArgDeliveredTy(v, ...)`.

| class | answers |
|---|---|
| same type index | 179 |
| `tySame` | 242 |
| reader open (`(V) => void`, `(_) => _`, `(T[]) => T`), pin closed | 235 |
| differ | 8 |
| `elabArgDeliveredTy` answered | 0 |

`elabArgDeliveredTy` has no answer at any delivery here. It records arguments a call builds at
another type, not function values coerced to a signature. The 8 `differ` rows show the two
questions part. The reader answers the value's own type, and the pin the signature the value is
coerced to:

* `(i32) => boolean ~ null`, `(i32) => K0 ~ null`, `() => i64 ~ null`: a nullable closure element
  or result, read where the reader has only the `null` arm
  (`arrays/nullable-closure-element-list.vl`, `closures/closure-result-nullable-closure-array.vl`).
* `(i32) => K0 ~ ((i32) => K0) | f64`, `(i32) => i32 ~ ((i32) => i32) | string`: a function arm
  of a union, where the reader has the whole union (`closures/closure-result-map-union.vl`,
  `closures/narrowed-fn-arm-place-call.vl`).
* `(string) => string ~ (i32) => i32`: a generic list written at two instances, where the reader
  has the other instance's element (`closures/generic-list-written-*-delivered*.vl`).

So the delivery pin does not switch onto the reader: the signature it coerces to is not the
node's type. It would switch onto a recorded delivery type, and the elaboration records none for
a function value. Recording one (the signature each delivery coerces to, keyed by the place) is
the elaboration change this family waits on.

## Switched and deleted

Nothing. Neither family has a type answer the reader gives and the pin lacks.
