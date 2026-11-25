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

* `letCellKindGo` (emit_classify) is `nulstruct` for a holder whose binding type has a null member.
  The module cell was already `(mut (ref null $rec))`; with the kind right, `globalReadRecovers`
  stops recovering the un-narrowed read, and `nullNarrowArmOf` recovers the narrowed one.
* The IR holds a local holder as `record | null` (`holderHeldRecordTy`, read by `irBDeclVar`). Its
  slot is the shared frame layout's, which the IR cannot retype, hence the cell-kind line.
  `holderReadTy` reads it as itself until it is narrowed, then as the record.
* `holderCellTakesNull` accepts `nulstruct`, so the module start stays claimed.

Ablated and dropped as redundant once the kind is right: an IR recover arm for the narrowed local,
and IR `ggNonNull` overrides for module holder reads. Kept because it is needed: the `holderReadTy`
branch (without it, `inFn` misses at `narrowed read`).

## Census: #10144 head → this head, same list

| | base | head |
|---|---:|---:|
| functions | 114,739 | 114,739 |
| claimed | 113,682 | 113,688 |
| lost | | 0 |
| `declaration coercion` | 9 | 3 |

The 6 gained functions are the 6 local holders above.

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
