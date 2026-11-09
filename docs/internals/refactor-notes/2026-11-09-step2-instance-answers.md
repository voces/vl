# Step 2: instance answers for minted lambdas and keyless frames; what stands

Base: master `81f85ec7` (#6922) with #6923, built to a fixpoint (6,569,345 bytes). Population: the
23,747 programs of `scripts/sweep.vl -- list`. The probe counts answers at `monoArgPinTyAt` where
`elabNodeTyOrChecked` answers −1, under `$VL_REP_SHADOW`. It was built by a scratch seed that was
never committed, and graded only programs that compile.

## The two arms

- **A lambda clone takes its template's type at mint.** `monoCloneLambdaSubst` recorded a type on
  the clone only where the pin closed the template's own type. Where it stays open (`(T) => void`
  handed to a generic whose `T` the enclosing instance binds), the clone now records the closed
  type the elaboration gives the template under the walked key (`monoLamCloneElabTy`). In all 15,
  that type was `(i32) => void`.
- **A frame with no instance key reads its call's parameter as the root does.** A non-generic
  function's body is keyed −1. `elabNodeTyAt` already reads that frame's calls as root calls
  (`elabRootCallTy`), but `elabRootArgParamTy` was gated on `fnIx < 0`. It now also runs where
  `elabKeyAt(fnIx) == -1`. This closes the 4 `Map()` arguments handed to a bare type parameter
  (D1887, `empty-map-to-bare-type-parameter`).

| no-answer inside an instance | before | after |
|---|---|---|
| a minted lambda with no type, keys 0, 2, 8 | 15 | 0 |
| `{[_]: _}` call, key −1 | 4 | 0 |
| `(U) => U` read, key −1 | 3 | 3 |
| `{fs: ((_) => _)[]}[]` read, key −1 | 3 | 3 |
| `{f: (T) => T, g: i32}` record, key −1 | 2 | 2 |
| `_` read, keys −1, −3, 3 | 6 | 6 |
| total | 33 | 14 |

## What stands inside an instance, and why

- **The 8 at key −1 that are not maps** are the root's own rows, read again in a non-generic body
  (the same programs, the same values). They stand for the root's reasons in #6920's note: the
  nullable function parameter, the list of records the record solve decides (step 7), and the
  record whose generic field is called only under `is`.
- **The 6 `_` reads** are hole parameters forwarded from inside a lambda the enclosing function
  calls at two types (`hole-fn-param-handed-on-from-lambda-at-two-types`), or from a lambda nothing
  instances (`mono-lambda-forwarder-uninstantiated`). The −3 frame's chain has two kids under one
  key. The lambda instance's slot is never given its key, because only `monoMakeInstance` calls
  `elabSlotNote`, and a lambda clone does not.

## Graded

Sweep, base against candidate: 23,747 of 23,747 the same, 0 bytes-only movers, 0 output movers.
Fixpoint: a second refresh is byte-identical. Seed 6,569,345 → 6,569,473 bytes (+128).
