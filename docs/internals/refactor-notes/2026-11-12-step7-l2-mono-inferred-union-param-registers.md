# Step 7 L2 §7: a union parameter whose type parameter is inferred registers its union at the instance (D4937, D15762 closed), 2026-11-12

D15762 (w316) is the refutation pin that blocked step C5's type-only `unionHasRefArrayArmSlot`.
Under that change, the delivery of `e: i32[][]` to `probe<V>(v: V[][] | string)` boxes, but the
instance body fails to validate (`expected struct type, found (array (mut i32))`). D4937 is the
same receiver under `is f64[][]`. Today both are refused at the delivery.

The base is master `c3c39e3c`, with a fixpoint seed on both sides.

## The mechanism

The instance's parameter-pin synthesis (`monoMakeInstance`'s D2679 arm) decides whether a pinned
parameter registers its union through `monoPinMintedUnion(pinned, gateTy, …)`.

- `gateTy` is the argument's type, `i32[][]`, which holds no ref arm, so `monoPinMintedUnion`
  returns before registering anything.
- Only written type arguments (`exBN`) replaced it with the substituted annotation
  `i32[][] | string`. That is why `probe<i32>(e)` runs.
- With `V` inferred, the instance registers no union, and its module has no union box type at
  all. The parameter lowers as `ref` to the `i32` backing array, while the body's `struct.get`
  reads the box.

A program that also spells the call with type arguments shares the registered row, so the
inferred call runs there too. The witness has to be inferred-only.

## Changed

`gateTy` takes the parameter's own substituted type (`pinOwn`, when it is closed) first. The
written type arguments' substitution is the fallback, as before.

The new fixture `generics/union-param-inferred-nested-list-arm-registers-its-union.vl` holds
D15762's and D4937's inferred calls only. Master refuses it; the candidate prints `0 1 0`.

## Proof

- **The witnesses:** D15762 prints `0` and D4937 prints `1`, each its `Want`. That holds on
  master with this change, and also with C5's type-only `unionHasRefArrayArmSlot` applied on top
  (simulated locally). C5 is no longer blocked by D15762.
- **Sweep.** The master fixpoint against the candidate fixpoint:
  - output movers 2, D15762 and D4937 (emit reject → runs);
  - runs → not-runs 0, new compiler traps 0.
- **D15763's matrix:** 24 of 24.
- **`check-filed-witnesses --strict`** on both inventories: 4,797 graded, 0 moved, 0 output
  mismatches.
- **Locally:**
  - refresh to a fixpoint, lint-self;
  - the comment-only fix leaves the seed byte-identical;
  - distilled `regress.vl`: no runs lost;
  - `cases_wasm_*` and the inventory tests: 7,512 passed.
