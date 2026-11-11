# Step 7 L2 §7: the naming rule spells every pin it can, and the census of the pins it cannot, 2026-11-11

The orchestrator's next target for emit_mono is the instance seam: an instance's pins should be
named from their canonical type (step 2's "the name derives from the canonical type"). The key
census (`2026-11-10-step7-l2-mono-key-census.md`) found that the instance identity is already
type-keyed on every path but `spelled`. What still depends on mono's spelling cascade is each
pin's text, which becomes the instance parameter's TypeRef.

`monoPinRespell` (`pin_spell.vl`) is the naming rule's one producer. Until this PR it re-spelled
only un-annotated parameters, and only for types `monoPinRespellOk` admitted: no record, map,
lone literal or non-literal union. This PR lifts both limits.

The base is #7210 merged into master, with a fixpoint seed on both sides. The population is the
whole sweep: 23,910 programs.

## Candidates

Each candidate was swept against the base seed.

| candidate | same | bytes-only | runs → not-runs |
| --- | --- | --- | --- |
| R1: annotated parameters too, at the argument's type (`pinTys`), `Ok` gate kept | 23,908 | 1 | 1 (D2679, invalid wasm) |
| R2: as R1, no `Ok` gate | 23,886 | 6 | 18 (union-box and `is` refusals, 2 invalid modules) |
| R1′: annotated parameters at their own type (`pinOwn`), `Ok` gate kept | 23,910 | 0 | 0 |
| **R2′: as R1′, no `Ok` gate (this PR)** | **23,910** | **0** | **0** |

R1 and R2 fail because an annotated parameter's pin is its annotation, not its argument. A
concrete `x: Shape` handed a `Circle` must keep `Shape`. At the parameter's own type, nothing
moves.

## What the rule changes and what it leaves

The probe ran in a scratch compiler (#7119's accumulator) at R2′. It records, per program and per
type class, where the rule's spelling differs from mono's and where the rule has no spelling.

| parameter | reached in | spelling changed (by class) | rule has no spelling (by class) |
| --- | --- | --- | --- |
| annotated | 5,987 | union 350, record 151, list 123, function 69, nullable 54, map 3, literal 1 | function 80, record 12, list 8, map 3, nullable 2; no type 2 (D5001 and its case) |
| un-annotated | 4,341 | function 260, record 102, list 47, union 43, nullable 20, map 15, literal 1 | function 601, list 134, record 80, map 10 |

Counts are programs. One program can appear in several classes.

- **The changes are text only.** In every program where the rule re-spells a pin, the module is
  byte-identical. No emit reader resolves those pins by their spelling any more, which is what
  the `Ok` gate guarded against. The gate and `monoPinRespellOk` are deleted.
- **The misses are where mono's cascade still names the pin.** They are mostly un-annotated
  function pins (601 programs), where the pin is a hole function or a signature key (`=>i>i`)
  that `monoPinSpellOf` has no spelling for. After them come lists and records holding one.
  Making the rule total over those classes is what would let the cascade's producers go.

## Changed

- `monoPinRespell(pinned, pinTys, params, pinOwn)` spells each parameter's pin from its closed
  type: `pinOwn` where the parameter is annotated, `pinTys` where it is not. The only exception is
  a type the rule cannot spell.
- `monoInstanceFor` calls it after `pinOwn` is built. The pin kinds are built before it, as on the
  call path.

## Proof

- **Byte sweep.** The #7210 seed against the candidate fixpoint: 23,910 of 23,910 are the same,
  with 0 bytes-only movers, 0 output movers and 0 runs → not-runs.
- **Locally:**
  - refresh to a fixpoint, lint-self;
  - render-parse (36 / 60), dead exports 0, late demands 6, seed size +0.5%;
  - `mono-tyaram-grid.sh` (252 OK, no BAD), distilled `regress.vl` (no runs lost);
  - `cases_wasm_*`, `vl_pin_spell_shadow` and the pin-helper test (7,443 passed).
