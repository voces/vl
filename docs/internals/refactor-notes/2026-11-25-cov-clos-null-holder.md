# Nullable bundle holder: the holder keeps `| null` (2026-11-25, lane COV-CLOS)

A binding that holds a map read of a two-signature bundle is that bundle's record or `null`. Before
this change, `letCellKindGo` answered `struct` for every holder, so each emitter read a missing key
as a non-null record and trapped. Coordinator ruling: close it with an IR claim, not a legacy fix.
The one line outside the IR is the cell kind, which both emitters read. It was flagged to the
coordinator before proving.

## Condition (a): did a claimed function hold a nullable bundle at the bare record?

Yes. A probe counted holders (`holderRecordTy`) whose checked type has a null member, per function,
over the 11,467-program list on #10144's head:

| | functions |
|---|---:|
| claimed, read a module holder at the bare record | 28 (16 `@start`, 12 others) |
| missed, read a module holder | 6 (`@init` ×5, one `@start`) |
| missed, hold a local holder (`declaration coercion`) | 6 |
| captures | 0 |
| self (compiler/entry.vl, 20,982 claimed functions) | 0 |

All 16 programs are under `tests/cases/closures/`. Each passes today because its key is present. The
claimed `@start` of the witness `const h = m["z"]; if h != null {…}` was `cmp`-identical to a
claims-off build: both emit `ref.is_null(ref.as_non_null(global.get $h))`.

## Mechanism

Shared plans (coordinator ruling: inside O3, so one PR):

* `letCellKindGo` (emit_classify) answers `nulstruct` for a holder whose binding type has a null
  member (`holderHoldsNull`). The module cell was already `(mut (ref null $rec))`. With the kind
  right, `globalReadRecovers` stops recovering the un-narrowed read, and `nullNarrowArmOf` recovers
  a narrowed local.
* `readOwesNonNullRecover` answers yes for a holder read narrowed past `null`
  (`holderReadPastNull`). It compared the read's rep kind, the bundle's function type, against
  `struct`, so a narrowed holder handed whole to a bundle parameter (`take(x)` in
  `module-holder-of-bundles-test-and-hand.vl`) got no `ref.as_non_null` and failed validation. The
  census, which counts claims, could not see that. The miss-key sweep found it.

IR:

* A local holder is held as `record | null` (`holderHeldRecordTy`, read by `irBDeclVar`). Its slot
  belongs to the shared frame layout, which the IR cannot retype; that is why the cell-kind line is
  needed. `holderReadTy` reads it as itself until it is narrowed, then as the record.
* A `nulstruct` module holder's cell is noted as `record | null` in every function (`globalRep`), not
  only where the start's initializer notes it. A read narrowed past `null` is the record
  (`holderReadTy`). A call through the holder takes its recover from `readOwesNonNullRecover`
  (`holderRecordOf`).
* `holderCellTakesNull` accepts `nulstruct`, so the module start stays claimed.
* `nullableRecordTyOf` (emit_rec_field_codes) and the two predicates sit emit-side, so `ir_build`'s
  phase-state surface does not rise.

Ablated and dropped as redundant once the kind was right: an IR recover arm for the narrowed local,
and IR `ggNonNull` overrides for module holder reads. Kept because it is needed: the local branch
of `holderReadTy` (without it, `inFn` misses at `narrowed read`).

## Claims-off ripple (`nulstruct`): master → head

Every program in the list was built claims-off (`VL_IR_SHADOW=1`) with both seeds, then compared
with `cmp`. The PR body lists each program whose bytes change, with its output before and after.
Every output change is a trap becoming the correct value. No program writes an invalid module on
either seed.

## Q58 position sweep

`tests/cases/maps/map-of-bundles-nullable-holder.vl`, the same output claims-off and claimed:

| position | base | head |
|---|---|---|
| module holder by index, key missing | trap | `map miss` |
| module holder by `get`, key present | `2` | `2` |
| module holder captured by a lambda, null-tested | trap | `false` |
| function holder by `get`, key missing | trap (at the declaration) | `map miss` |
| function holder by index, key present | `7.5` (on its own) | `7.5` |
| map of plain values, missing and present | `map miss`, `11` | same |
| function holder captured by a lambda | refused | refused: D17585, pre-existing |
