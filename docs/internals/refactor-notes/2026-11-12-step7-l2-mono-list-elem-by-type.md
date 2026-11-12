# Step 7 L2: a list argument's element pin is spelled from the element's type, 2026-11-12

Lane I's census 5 listed `monoArgTyNameProjected` and `monoPinAnnotatedParam` as failing. Both
took a list's element by peeling `[]` off the list's spelling with `listElemNameOf`:

- **`monoPinAnnotatedParam`, for a `T[]` parameter.** `bind = listElemNameOf(an2)` became `T`'s
  `tvV` binding text. That text is substituted into the instance body's annotations.
- **`monoArgTyNameProjected`, for an indexed element argument (`id(xs[0])`).** The element pin was
  `monoAnnPinName(listElemNameOf(arrTy), aet)`.

Both now spell the list's element type with the naming rule's producer, `monoPinSpellShaped`. The
element type is `tyArrayElemIx(lt)` for the binding and `aet` for the indexed element.

## Measured

A scratch probe compared the peeled spelling with the rule's spelling of the element type. It
counted decisions over 24,070 programs and was never seeded.

| site | same | different (by element kind) | rule has no spelling |
| --- | --- | --- | --- |
| `T[]` binding | 1,875 | 87 in 55 programs: record 61, map 12, list 7, union 6, nullable 1 | 0 |
| indexed element | 2 | 4 in 3 programs: record 4 | 0 |

The text changes, so every one of the **58** programs where it differs was built twice, once with
a base compiler and once with the cut's, both from one seed. The modules were compared with
`cmp`. **All 58 are byte-identical**, or refuse with the same message on both sides. The renamed
bindings and pins name the same instance and rows.

The probe reports through `emitFail` and is blind to programs that already refuse. CI's sweep
covers those.

## Counts

- `listElemNameOf` in `emit_mono.vl`: 2 → 0, and the import goes.
- `emit_mono.vl` spelling reads: 4 → 2. The two left are the `structIndexByName` reads in
  `monoAnonRowListTy` and `monoElabCompositeTy`. Both are BY DESIGN: a `#anon` row handle, and a
  type parameter shadowed by a record name. Their contract sentences went to lane I.
- pin-helper: 908, unchanged.

## Proof

- **Locally, on master after #7673:**
  - refresh to a fixpoint;
  - `lint-self.sh` clean;
  - kind-ladder 0;
  - late demands 8;
  - seed +1.9%;
  - `mono-tyaram-grid.sh` 0 BAD;
  - `regress.vl`, no runs lost;
  - `check-filed-witnesses --strict`: 4,862 as filed.
- **The sweep** is CI's (`sweep` label).
