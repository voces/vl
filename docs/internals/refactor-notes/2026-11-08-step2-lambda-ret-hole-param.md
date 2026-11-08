# Step 2: the lambda-return pin and `monoPinHoleParam` read the elaboration

Base: master `49986e21`, built to a fixpoint (6,570,503 bytes). Population: the 23,740 programs of
`scripts/sweep.vl -- list`, each built once by a scratch probe seed that was never committed.
Counts are answers at a site, not programs. This follows `2026-11-08-step2-lambda-delivery-shadows.md`
(#6903) and `2026-11-08-step2-arg-coverage.md` (#6897).

## The lambda return: the elaboration already holds the 48

`monoLamElabRet` had three arms: the instance's elaboration of the lambda when its return is closed,
else that return substituted through mono's binding `bN`/`bT` (`monoSubstInst`), else the return
the lambda's own instances under the walked instance agree on (`elabWalkKidRet`). Shadow, at each
answer of the binding arm, against `elabWalkKidRet`:

| arm | answers | against `elabWalkKidRet` |
|---|---|---|
| binding | 43 | 42 same, 1 `tySame`, 0 differ, 0 none |
| kid instances | 13 | (is that reader; the instance's own type is absent at all 13) |

The open return is the lambda's own hole (`?#L28.0` in D12235's witness). The walked instance's key
does not bind it, but the lambda's instance under that key does. So no new record is needed: the
binding arm is deleted and the kid instances answer. `monoLamRetFromKids` (was `…FromBinding`)
keeps the binding arm's meaning, the answer closing a signature the instance kept open, so `er`
and the box registration are unchanged. `monoLamPinRetAnn` no longer takes the binding.

## The delivery pin: its type is already the elaboration's delivery fact

Every pin type `monoDeliverAtPinTys` is handed comes from `elabStampAt`, or from
`monoSlotPinNameTys` → `monoDeclPathKeys` → `elabSlotDeliveries`, the elaboration's closed
signatures a place's slot is delivered at. The one other source is the place's own closed checked
type (an element written with no flow pin). #6903's 8 `differ` rows compared that pin with the
VALUE's type (`elabNodeTyOrChecked`), and the value's type is not the signature it is coerced to.
A per-value record keyed by the coercion site would repeat `elabSlotDeliveries` keyed by place.
None was added. What remains in mono there is the signature key (`pinSigOf`) and the coercion,
both rep.

## `monoPinHoleParam`: three sites onto `monoArgPinTyAt`

| site | same | `tySame` | differ |
|---|---|---|---|
| the hole-function fallback (`vt`) | 62 | 7 | 2 |
| the tail (`anTy`) | 40 | 7 | 2 |
| the elaborated parameter (`elTy`) | 0 | 0 | 0 |

The 4 `differ` rows are two programs (`closures/fn-record-field-list-read-by-param.vl`,
`closures/maker-result-in-module-record-field-passed-whole.vl`). The old pin banked `_`, and the
new one gives the argument's record (`{xs: ((_) => _)[]}`, `{f: (T) => T, g: i32}`). Neither
module moves. `monoArgPinTyIx` is now called only from `monoPinTyParamComposite` (lane w176).
D6544 does not move here: the instance is keyed by `monoArgPinName`/`monoArgTyName`.

## The open-type no-answers, by the instance that should close them

A probe at `monoArgPinTyAt` and the composite sites, where `elabNodeTyOrChecked` answers −1:

| class | answers | what should close it |
|---|---|---|
| root, a generic or hole function value handed on (`(T) => T`, `(_) => _`, in a binding, list or record) | 543 | the callee's instance the call reaches: its parameter type there |
| root, an empty or open container (`T[]`, `{[_]: _}`, `Set<_>`) | 50 | the callee instance's binding of the element |
| inside an instance, a minted lambda with no checked type | 15 | the instance's own record of the clone (#6897's class (b)) |
| keys −2/−3, or a parameter read at the root | 8 | (several in-place instances; no single instance) |

The composite sites print once per site, so 654 lines cover #6897's 592 answers.

## Graded

Sweep, base against candidate: 23,740 of 23,740 the same, 0 bytes-only movers, 0 output movers.
Fixpoint: a second refresh is byte-identical. Seed 6,570,503 → 6,570,468 bytes (−35). Pin-helper
budget 921 → 921.
