# Step 7 L2 §7: `monoInstanceFor` asks the type, 2026-11-10

The mono key census (`2026-11-10-step7-l2-mono-key-census.md`) found three spelling decisions in
`monoInstanceFor` whose type twins agree with the spelling everywhere they are reached. This PR
switches all three to the type.

The base is master `6826f8ba`, with a fixpoint seed on both sides. The population is the whole
sweep: 23,863 programs (`cases`, `distilled` and `inventory`).

## Changed

| decision | was | now | reached | twin disagreed |
| --- | --- | --- | --- | --- |
| a concrete parameter annotation agrees with the boundary | `normTypeAtom(ann) == normTypeAtom(pin)`, or the types | `monoPinNamesTy(pinTy, annTy)` alone | 21 programs | 0: the spelling never passed a pin the type refused, and no pin lacked its type |
| the substituted result differs from the slot's (D9282) | `normTypeAtom(monoInstanceSubstRet(...)) != monoInstanceRetName` | `!tyEq(rsTy, want)` | 49 | 0 by outcome: 25 had spellings apart and types equal, and `elabWidenedRet` widened none of them |
| the widened result's key part | the slot's result spelling | `tyToStr(want)`, as the maker path keys it (D14941) | 8 fire | 0: one-to-one in all 8 |

`monoInstanceSubstRet`, which spelled the result through the bindings for the second decision,
is deleted. The first decision no longer reads the declared spelling (`monoDeclAnnName`).

The render-parse ratchet does not move (39 / 70). `normTypeAtom` and `annRetNameOf` are outside
its parser list, and `monoInstanceRetName` stays as the widened result's TypeRef text.

## Proof

- **Byte sweep.** `sweep.vl record` over the whole population with the master fixpoint and with
  the candidate fixpoint: 23,863 of 23,863 are the same, with 0 bytes-only movers, 0 output
  movers and 0 runs → not-runs.
- **Locally:** refresh ×2 byte-identical, rep-fuzz, lint-self, seed-size, late-demands,
  dead-export, render-parse, pin-helper budget, cases_wasm 0–3, inventory refs/rows,
  `vl_scaling_shape`, `vl_probe_rollback`, plumb-shape-cost, self-compile-time, and
  `check-filed-witnesses --strict` on both inventories.
