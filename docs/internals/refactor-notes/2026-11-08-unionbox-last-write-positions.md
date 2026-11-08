# The box record is the last write; four positions read it (2026-11-08)

Step 5, union boxing round 4. Follows `2026-11-08-unionbox-write-order-variant-fields.md` (#6769).

## The recorder's policy

`boxTyStampOne` (checker) now keeps the standing record when a write either has no emit name or
names an open type parameter over a closed union (`boxTyKeeps`). Every other write replaces it,
so the record is the final check's write. The elaboration path of `ctxTyStampOne` used to write
`elabCapBox` directly; it now goes through `boxTyStampOne`, so one rule covers both scopes.

## The `f64|null` conflict is a checker defect: D15550, closed here

`n == [1.0, null]` with `n: (i32|null)[]`: `eqLitDeliver` (D15091) tried the literal at the
other operand's type with a stamping `assignableExpr`. The `null` element fit `i32|null` and its
record was written there before `1.0` refused the whole delivery. The literal is built at its
own `(f64|null)[]`. Ablation: spelling `1.0` as `1` (the delivery holds) or binding the literal
at `(i32|null)[]` (a check reject) both remove the conflict. Fixed by asking the fit quietly
first, then stamping only a delivery that holds.

## Shadow re-run (history graded before any position switched)

| last-write misses | #6769 | policy | policy + D15550 |
|---|---|---|---|
| open type parameter after a closed union | 27 | 0 | 0 |
| value already a box (6 a `??` join) | 7 | 7 | 7 |
| spelling (`K\|i32` vs `string\|i32`, member order, `#lu2`) | 8 | 8 | 8 |
| `f64\|null` then `i32\|null` | 1 | 1 | 0 |

The 27 records that used to render empty now hold the closed union: 21 `agree`, 4 `agree up to
spelling`, 2 `disagree` that is alias spelling (`S|boolean` against `{g:i32}|boolean`).
Sweep after the policy alone: 0 movers.

## Positions switched

`emitUnionBoxOwed` (from `emitVariantFieldBox`): `emitDelivered` where `boxOwedAt` holds, else
the site's union. Switched: returns (`emitReturnCoercedValue`, 29,604 top-level deliveries),
struct-field value (`emitStructFieldValueUnder`, 2,652), arm-to-pair (`emitUnionArmToPair`,
798), array elements (`emitArrRef`, 4,178). The probe tags a floor `floor@<pos>`. **36 top-level
deliveries in 17 files floor:**
- 10 have no record (`v128|null` elements) and 5 a record that renders empty.
- 7 are a call that never returns.
- 9 are a value already a box.
- 5 are a nullable niche or a literal set (`i32|null`, `1|2`) that still store a box.

Union-box call sites deleted: 0. Four `emitUnionBoxArg` sites read the table now.

**Parked: `emitUnionIfArm`** (11 history rows). Switching it moved one program's bytes
(`generics/param-union-bound-from-one-union-argument`, output unchanged). In
`D<A, B>(d: i32, v: A | B | null)` at `A = f64`, `print(v ?? d)` records `d`'s box as the join's
`f64|string`, so `7` is boxed as f64, while the site union `f64|string|i32` keeps it i32 (the
direct spelling also keeps i32). That record is the inconsistent one. It needs a ruling on the
instance join before this position reads it.

## Proof

Fixpoint seed 6,505,674 bytes (base fixpoint 6,505,351, +323; refresh twice, byte-identical).
Sweep base against candidate: 23,626 same, 0 bytes-only, 0 `runs → not-runs`, 0 new traps.
