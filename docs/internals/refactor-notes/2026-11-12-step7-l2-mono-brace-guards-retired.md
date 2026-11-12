# Step 7 L2: the narrowed pin's brace guards are retired behind a loud floor; D15978 and D15979 closed, 2026-11-12

`monoNarrowedPinName` had two spelling guards in front of the arm test:

- **D2780:** a narrowed record skipped to the nominal rung when the wide pin's spelling held no
  brace (`!strContains(wide, "{")`).
- **D9330:** a narrowed list of records answered `""` when no arm of the wide pin's spelling held
  a brace (`!monoWideArmsHoldBrace(wide)`, emit_mono's last `unionArmsOf`).

Both stood in for "a record's render can be an arm of `wide`". Since #7606 the arm test reads the
wide pin's type (`monoTyNarrowsFrom`).

A typed twin could not replace them. In #7666's probe the record guard's twin disagreed in 172
decisions and the list guard's in 3. In a further 23 and 82 decisions the wide pin had no type
while its spelling held a brace. The coordinator's ruling was to retire both behind a loud floor,
placed where a guard changes the outcome, and to report any program that fires it before going
further.

## The floor

A scratch compiler, never seeded, computed two answers at each guard:

- the guard's own;
- what the rest of `monoNarrowedPinName` answers without it (`monoFloorRest`).

It called `emitFail("FLOOR …")` only when they differed.

**Controls.** Two hand-written programs fire the floors, and each is a clause-1 bug on master:

| control | floor | master | without the guard |
| --- | --- | --- | --- |
| `type W = {r: i32} \| string`, a narrowed `w` passed to `id<T>` | D2780 | check-clean **invalid wasm** inside `id`: expected the record, found the union box | runs, `3` `0` |
| `type R = {r: i32}; type W = R[] \| string`, the same | D9330 | check-clean **invalid wasm**: expected `R[]`, found the union box | runs, `1` `0` |

Both are filed: [D15978](../inventory/D15978.md) and [D15979](../inventory/D15979.md). They share
the fixture `tests/cases/soundness/narrowed-inline-record-arm-of-alias-union-pin.vl`.

Two more controls with the same shape did not fire the floors, and they run on both seeds: an
inline-record list arm, and a non-alias `{r: i32}[] | i32`.

**Population.** Over 24,070 programs the floor fired in **1**:
`tests/cases/soundness/error-generic-nulreflist-field-pin.vl`, at the D9330 guard. It is a `@run`
fixture. With the guard, the narrowed `P[]` pin is `""` and the rep cascade answers it. Without
the guard, the pin is `P[]`. The module bytes differ, at 240 bytes on each side. Both print the
fixture's `7`.

## Changed

- Both guards are deleted from `monoNarrowedPinName`.
- `monoWideArmsHoldBrace` is deleted, and with it the `unionArmsOf` import.
- `monoTyIsListOfRecord` is deleted, since only the D9330 guard called it.

## Counts

- `unionArmsOf` in `emit_mono.vl`: 1 → 0.
- `emit_mono.vl` spelling reads: 5 → 4. That leaves `structIndexByName` ×2 (BY DESIGN) and
  `listElemNameOf` ×2.
- pin-helper: 910 → 908, baseline written.

## Proof

- **Locally, on master:**
  - refresh to a fixpoint;
  - `lint-self.sh` clean;
  - kind-ladder 0;
  - late demands 8;
  - seed +1.9%;
  - `mono-tyaram-grid.sh` 0 BAD;
  - `regress.vl`, no runs lost;
  - `check-filed-witnesses --strict`: 4,862 as filed, D15978 and D15979 run;
  - the inventory row and reference tests pass.
- **CI's sweep.** It should report one bytes-only mover, `error-generic-nulreflist-field-pin.vl`,
  and no runs lost.
