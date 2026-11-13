# Step 7 L2: mono's instance registries are keyed by type and by instance slot, 2026-11-12

Census 5 left five spelling-keyed registries. Lane D owns four of them, and this cut converts
all four. It also converts lane H's last mono NAME row, `monoSlotSig` / `monoSlotParamPins`.

| registry | was | now |
| --- | --- | --- |
| `monoKeyEk`, `monoKeyPins` | keyed by mono's registry key, which on the `spelled` path is the pins' spelling | `monoInstEk`, `monoInstPins`, keyed by the instance's slot |
| `monoTypedKeys` | typed key → registry key; a pin with no resolved type kept its spelling (`S:`) | typed key → registry row; a pin with no resolved type is refused loudly |
| `instKeyFirst` | canonical key → the first instance's mono key, a merge seen as two keys | canonical key → the first instance's slot, a merge seen as two slots |

`monoCadNoteInstance` no longer takes a key, because it reads both tables by the slot it is
given.

**`monoSlotSig`.** It rendered an instance's parameter annotations (`tyNameOf`) into `p1,p2,;`.
Its seven callers now ask the type:

- Three only asked whether the text was empty. They call `monoSlotIsFn`.
  `monoNoteBindSig` loses its signature argument, which it only tested for empty.
- Three compared the text against a signature spelled from types the caller already holds. They
  call `monoSlotParamsAre(fe, tys)`, which uses `tySame`, with an un-annotated parameter read as
  `i32`, as `monoCellLamTakeAt` does.
- One rendered a function-type name and handed it to `monoNoteBindDeliveryAt` with no type.
  With no type, that call returns at once for a read with a name, so the name reached nothing. The
  call is gone. A read with no name now fails loudly.

## Measured

A probe compiler compared each old read with its replacement over the sweep population (24,070
programs recorded):

| site | decisions (programs) | result |
| --- | --- | --- |
| `monoKeyEk` / `monoKeyPins` in `monoCadNoteInstance`, by key vs by slot | 4,332 (1,766) | all agree |
| `monoKeyEk` at a typed hit, by key vs by the row's slot | 469 (226) | all agree |
| a typed hit's stored row vs the first row under its key | 469 (226) | all agree |
| a registry key, or a slot, written twice | 0 | — |
| typed-key writes holding an `S:` spelled pin | 0 of 26,769 | floor never reached |
| `monoSlotSig(fe) != sig` (delivery) vs `monoSlotParamsAre` | 95 (42) | all agree |
| `monoSlotSig(fe) == target` (rename) and the check after it | 21 (11), 9 (4) | all agree |
| `monoSlotSig(...) == ""` | 32,113 | never empty |
| the rendered name reaching a nameless read | 8 (2) | 0, all inert |

`instKeyFirst` runs only under `VL_REP_SHADOW`. All 7,879 files under `tests/cases` were built
with the probe and the shadow on. Every key noted a second time (40 decisions in 33 files) gives
the same merge verdict by slot as by mono's key.

The probe reports through `emitFail`, so it cannot see programs that already refuse. CI's sweep
covers those. The seed is 128 bytes smaller.

## Counts

- Spelling-keyed registries: 5 → **1**. `sNameIx` is left, with lane B.
- String-keyed registries (`registry-census.vl`): 76 → 74.
- `monoTypedKeys` and `instKeyFirst` stay keyed by text, but the text is a type key by
  construction: `tyCanonKey` per pin, slots, frames and callback names.
- Floors left in the typed key: the pin discriminators `monoAnonPinDiscrim` and
  `monoSigPinDiscrim` test the pin's spelling shape to decide whether to add a canonical key, and
  `monoTypedExtra` keeps the explicit-binding text when its count disagrees.
- `monoKeys`, the registry itself, stays spelled from the pins by design (refactor plan).
- `monoSlotSig` and `monoSlotParamPins`: deleted.
- pin-helper: 908, unchanged (two deleted, two added).

## Proof

- **Locally, on master:**
  - refresh to a fixpoint;
  - `lint-self.sh` clean;
  - `scripts/gate.sh`: all 23 rows pass, among them seed size, late demands, render-parse,
    filed witnesses and the distilled corpus;
  - `mono-tyaram-grid.sh`: 252 OK, 9 REJECT, 0 BAD.
- **CI's sweep** should report no movers.
