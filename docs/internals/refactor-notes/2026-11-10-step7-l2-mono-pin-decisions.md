# Step 7 L2 §7: the mono pin decision renders (40 → 39 renders, 71 → 70 parses), 2026-11-10

The render classification (`2026-11-10-step7-l2-render-classes.md`) found four decision renders.
Three are mono pin comparisons and one is `boxTagOfTy`. This PR settles the three comparisons:

- `monoDeclRecListPinName` is deleted.
- `monoNicheWidenedPinName`'s `nullablePartOf` decision asks the type.
- `monoNarrowedPinName` stays, because its render is the pin it returns.

The base is master `21bd6cb5`, with a fixpoint seed on both sides. The population is the whole
sweep: 23,862 programs (`cases`, `distilled` and `inventory`).

## Method

`monoArgPinName` asks `monoArgTyName` for the ladder's pin `w`, and that call also hands back
the type `wTy` it answered with. Each comparison was probed against a twin that reads `wTy`. The
probes are the accumulator from `2026-11-10-step7-l2-mv-value-ladder-of-ty.md`, in a scratch
compiler that was never refreshed into a seed.

| site | spelling decision | type twin | reached | disagree |
| --- | --- | --- | --- | --- |
| `monoNicheWidenedPinName` | `nullablePartOf(n) == chosen` (`n` the node's render) | the node's type is `Nullable(cTy)` | 287 programs (115 cases, 52 inventory, 120 distilled) | 0; `cTy` never -1 |
| `monoNicheWidenedPinName` | `n == chosen` | `tySame(nt, cTy)` | — | most of the reaches, see below |
| `monoDeclRecListPinName` | `w == tyToEmitName(ty)` | `tySame(wTy, ty)` | 0 of 23,862 | — |

The `n == chosen` twin is not usable. A pin is spelled in the instance-key namespace (sig keys
such as `=>i>i`, literal-union aliases such as `K`). The render is not in that namespace, so the
two sides differ even where the types agree. That comparison stays on the pin-key seam.

## Changed

- **`monoNicheWidenedPinName(ax, chosen, cTy)`** widens only when the node's type is the nullable
  of `cTy`. Its render stays, because the render is the widened pin it returns.
- **`monoDeclRecListPinName` is deleted**, with its call in `monoArgPinName`. No program in the
  population gets past its guards, its own witnesses included: `D3792` and `D3793` run without
  reaching it. The earlier rungs (`monoNarrowedPinName`, `nulRecListNominalName`) now answer
  them.

## Left

- **`monoNarrowedPinName`**: its render (`n`) is compared against `wide` and then returned as
  the pin, so the render is the product. It goes when instances are keyed by type.
- **`boxTagOfTy`**: its tag is per spelling (D4320). The rep-id twin disagrees both ways, as
  measured in the classification note.

## Proof

- **Byte sweep.** `sweep.vl record` over the whole population with the master fixpoint and with
  the candidate fixpoint: of 23,862 programs, 23,862 are the same. That is 0 bytes-only movers, 0
  output movers and 0 runs → not-runs.
- **The render-parse ratchet** goes from 40 / 71 to 39 / 70, with `--write-baseline` in this PR.
- **Locally:** refresh ×2 byte-identical, rep-fuzz, lint-self, seed-size, late-demands,
  dead-export, render-parse, pin-helper budget, cases_wasm 0–3, inventory refs/rows,
  `vl_scaling_shape`, `vl_probe_rollback`, and `check-filed-witnesses --strict` on both inventories.
