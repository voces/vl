# Step 7 L2: a struct-field argument's pin is the field's recorded type, 2026-11-12

Lane I handed over this site: one of the last two callers of `isSName`, a name predicate the step-7
census grades as failing. Lane B had cleared `isSName` for lane I, but the caller is in this lane's
file.

`monoArgTyNameProjected`'s `argN is Member` arm pins `id(o.inner)` at the field's record. It did
this from names:

- it read the field's element name with `sFieldElemNameAt(rsi, fi)`;
- it asked `isSName(fnm)`;
- it found the row with `structIndexByName(fnm)`;
- it returned `fnm`, with `sTyIx[row]` as the type.

It now reads the field's recorded element type, `sFieldElemTyIxAt(rsi, fi)`, peeled of `null`. A
struct row holds that type when `structRowOfRecordTy` finds one. The arm then returns the type
itself, and the pin text comes from the naming rule, `monoPinSpellShaped`.

## Measured

A scratch probe ran over 24,070 programs of the sweep population and counted decisions. It was
never seeded.

| question | decisions (programs) | agree |
| --- | --- | --- |
| does a struct row hold the record? (`isSName` against `structRowOfRecordTy`) | 5 (4) | 5 |
| which row? (`structIndexByName` against `structRowOfRecordTy`) | 5 | 5 |
| the type returned (`sTyIx[row]` against the recorded type) | 5 | 5, the same arena index |
| the pin text (`fnm` against `monoPinSpellShaped`) | 5 | 5 |

No decision lacked a type. The probe reports through `emitFail` and cannot see a program that
already refuses. CI's sweep covers those.

## Counts

- `isSName` in `emit_mono.vl`: 1 → 0, and the import goes. Lane I reports that `isSName` then
  keeps only `pinKindOfName`, the `#anon` handle contract.
- `structIndexByName` in `emit_mono.vl`: 3 → 2. The remaining two are `monoAnonRowListTy`'s
  `#anon` handle and `monoElabCompositeTy`'s type-parameter shadow check, both BY DESIGN in the
  famb struct-name grading.
- `sFieldElemNameAt` in `emit_mono.vl`: 1 → 0, and the import goes.
- `emit_mono.vl` spelling reads: 9 → 7. Of these, 3 are lane G's `unionArmsOf`, 2 are the
  BY DESIGN `structIndexByName` reads, and 2 are `listElemNameOf`.
- pin-helper: 910, unchanged.

## Proof

- **Locally, on master:**
  - refresh to a fixpoint;
  - `lint-self.sh` clean;
  - kind-ladder 0;
  - late demands 8;
  - seed +1.9%;
  - `mono-tyaram-grid.sh` 0 BAD;
  - `regress.vl`, no runs lost;
  - `check-filed-witnesses --strict`: 4,859 as filed.
- **The sweep** is CI's (`sweep` label).
