# Step 7 L2 §7: the body rewrite's substituted annotation reads the instance's typed binding, 2026-11-10

The mono key census (`2026-11-10-step7-l2-mono-key-census.md`, cut order item 3) puts the
clone's annotation text first: `monoPinAnnSpelling` and the ladder's pin text stay products while
the body rewrite reads them back. Naming-rule slice 4 (`2026-11-08-naming-slice4-readers.md`)
measured the rewrite's two name readers:

- S3, `monoSubstAnnNode`'s `sty < 0` arm, in 40 programs;
- S4, `monoSubstIsExpr`'s `recordClonedIsVarTy`, in 18 programs.

Closing both at the walk key (`elabWalkTop()`) cost 12 runs → not-runs, because that key is not
the binding the instance's pins spell. This PR hands the rewrite the instance's own typed binding
and closes S3 with it.

The base is master `e6d70dc3`, with a fixpoint seed on both sides. The population is the
whole sweep: 23,866 programs.

## Changed

- **`monoMakeInstance` takes `tvT`**, the binding's types beside `tvN` / `tvV`. Both callers
  (`monoInstanceFor`, `monoInstantiateCallIn`) already held it. The binding is held for the
  duration of the build (`monoInstBindN` / `monoInstBindT`), saved and restored around nested
  builds as `monoInstOwn` is.
- **S3**: where the exact bindings leave the substituted annotation open, `monoInstBindTyOf`
  types it from the instance's binding. Only when that also leaves it open does the node take the
  spelling fallback (`synthTypeRefFb`).

## Probed

A scratch probe compared, at S3's fallback, `nameToTy` of the substituted spelling against the
binding twin. 39 programs reach it: in all 39 the twin is closed and `tyEq` to the spelling's type,
with 0 programs having no binding and 0 having no type.

## S4, tried and reverted

Asking the binding first at every cloned `is` test lost 12 runs. Examples:

- `generics/list-param-join-nullable-element.vl` (emit reject);
- `maps/for-in-union-of-maps.vl` (trap);
- `unions/inferred-list-union-generic-complement-length.vl` (trap).

An `is` test's banked type is the arm the spelling names: a union's rep arm, a `#anon` row's
list, a signature key. The binding's type is not that arm. S4 closes only where the name resolves
to nothing, which is the arm `recordClonedIsVarTy` already guards. That leaves the per-arm
question to the union registry (census item 4).

## Proof

- **Byte sweep.** `sweep.vl record` over the whole population with the master fixpoint and with
  the candidate fixpoint: 23,866 of 23,866 are the same, with 0 bytes-only movers, 0 output
  movers and 0 runs → not-runs.
- The render-parse ratchet does not move (39 / 70). S3's fallback is a `nameToTy`, which is outside
  the ratchet's parser list. This PR is the precondition that lets the rewrite stop reading the
  pin text.
- **Locally:** refresh ×2 byte-identical, rep-fuzz, lint-self, seed-size, late-demands,
  dead-export, render-parse, pin-helper budget, cases_wasm 0–3, inventory refs/rows,
  `vl_scaling_shape`, `vl_probe_rollback`, plumb-shape-cost, self-compile-time, and
  `check-filed-witnesses --strict` on both inventories.
