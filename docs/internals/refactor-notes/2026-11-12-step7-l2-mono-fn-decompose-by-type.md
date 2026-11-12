# Step 7 L2 §7: three of emit_mono's function-type decompositions ask the type; the `is` arm and two pin builders are measured floors, 2026-11-12

w310 is retiring emit_base's spelling predicate `annFnDecompose`. emit_mono called it at six
sites:

- three directly;
- three through `monoFnTypeAnnParamsName`.

The base is #7418, with a fixpoint seed on both sides. The population is the whole sweep: 23,984
programs.

## Probed

The probe ran in a scratch compiler (#7119's accumulator). At each site it compared the
decomposed spelling with the site's type:

| site | reached in | differs | how |
| --- | --- | --- | --- |
| A: `monoCoerceAtValueParams` (an annotated callee's arity) | 845 | 23 | only a nullable function annotation, which the decomposer declines |
| B: `monoNoteRetDeliveriesAt` (is `ann` a function type) | 8,303 | 18 | the same nullable case |
| C: `monoNoteBindDeliveryCall` (the signature pins) | 2,581 | 35 | see below |
| D: `monoCloCoerceBuild` (a member's parameter pins) | 15 | 0 | — |

Site C's differences:

- the annotation's own text kept (`string` for a literal alias `K`);
- a record spelled inline where the rule names its row (`{k:K}` against `R`);
- member order;
- a `void`-result annotation whose type is no `TyFunc`.

C's parts become instance pins (`monoSigPins`), so those spellings are keys.

## Changed

- **A** takes the arity of the annotation node's type when that type is a `TyFunc`. A nullable
  function still declines, as the decomposer did.
- **B** asks whether `annTy` is a `TyFunc`.
- **D** spells the member type's parameters with `monoPinSpellShaped`.

## Floors

- **C**, and the respelling in `monoDeliverLamLit` (`annFnDecompose` plus
  `monoFnTypeAnnParamsName`), build an instance pin from the destination's annotation text. A
  typed version renames those pins in 35 programs at C. That is a key change, not an identity
  move, and it waits for the pin keys to be typed.
- **w321's `is` arm** (`monoFoldLayoutAt`, the last emit_mono `monoSubstAnn` call) was measured,
  not changed. It is reached in 57 programs:
  - the elaboration's per-instance check type (`elabIsPatTyIn`) agrees with the substituted
    spelling in every one but `generics/unbound-type-param-reaching-is-stays-unbound.vl`;
  - the instance's typed binding (`monoInstBindTyOf`) disagrees in 16;
  - in the D4551 fixture, the spelling binds `U` to the encloser's unbound `T`, and that is what
    keeps the `is` refused. Every typed source has already defaulted `U` to `i32`.
  - Swapping in the typed binding turns that contract fixture from a refusal into a run, so the
    arm waits for a typed "left unbound" fact.

## Proof

- **Byte sweep.** The #7418 fixpoint against the candidate fixpoint: same 23,984, bytes-only 0,
  output movers 0, runs → not-runs 0, new compiler traps 0.
- **Locally:**
  - refresh to a fixpoint, lint-self, dead exports 0;
  - render-parse 13 / 55 (`--findings`);
  - `mono-tyaram-grid.sh`: 252 OK, 0 BAD;
  - `cases_wasm_*`, pin-helper and pin-spell shadow tests: 7,475 passed.
