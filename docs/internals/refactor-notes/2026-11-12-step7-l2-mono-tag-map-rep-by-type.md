# Step 7 L2: a tagged set's map or record pin is spelled from its stored type, 2026-11-12

Lane H's rep-classifier census lists `monoTagMapRepName` as an ARENA+NAME pair. It builds the
stored spelling of a tagged set's container by hand:

- for a map of the set's ids, `"{[" + tyToStr(key) + "]: i32}"`;
- for a record holding one, field by field, from each field's stored spelling.

That text is the pin of a hole parameter bound to such a container (`monoPinHoleParam`).
`monoTagRecordPinKind` compares a pin against it, and `monoMakeInstanceParams` asks whether one
exists.

It now builds the stored type and spells it with the naming rule's producer,
`monoPinSpellShaped`:

- for a map, `mapStoredTyOf(t)`;
- for a record, `mkObjTy(names, sts)` over the fields' stored types (`st`), which the function
  already computes for each field's code.

The field codes and per-field texts it hands back are unchanged, and so is every case that
answers `""`.

## Measured

A scratch probe compared the hand-built text with the rule's spelling of the stored type. It was
never seeded. The two never agree: the rule spaces and names differently. They differed at all
557 decisions in 60 programs (map 21 decisions in 10 programs, record 536 in 50).

Every site changes, so all 60 programs were built twice, with a base compiler and with this
cut's, both from one seed:

- **59** are byte-identical, or refuse with the same message on both sides.
- **1** moves bytes only: `tests/cases/functions/hole-param-called-and-handed-on-in-record.vl`.
  Its module is 1,233 → 1,224 bytes. The disassembly shows the old pin minted a twin record
  type, `(sub $3 (struct (mut i32) (mut i32)))`, beside the row's own. The new pin names the row,
  so the twin is gone. The program prints the same 20 lines.

The probe reports through `emitFail` and is blind to programs that already refuse. CI's sweep
covers those.

## Counts

- `monoTagMapRepName` no longer calls `tyToStr` or assembles a spelling.
- pin-helper: 908, unchanged.
- **Not in this cut:** `monoSlotParamPins`. Its last caller is `monoSlotSig`, the first-instance
  signature key (`p1,p2,;`). Seven sites compare or note it, so it moves with the instance-key
  registries, the next item.

## Proof

- **Locally, on master:**
  - refresh to a fixpoint;
  - `lint-self.sh` clean;
  - kind-ladder 0;
  - late demands 8;
  - seed +1.9%;
  - `mono-tyaram-grid.sh` 0 BAD;
  - `regress.vl`, no runs lost;
  - `check-filed-witnesses --strict`: 4,863 as filed.
- **CI's sweep** should report the one bytes-only mover named above.
