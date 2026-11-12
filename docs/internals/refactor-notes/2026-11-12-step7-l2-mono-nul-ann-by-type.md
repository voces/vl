# Step 7 L2: mono's nullable pin is recognised by its type; emit_mono has no parse left, 2026-11-12

`monoNulAnnName` is the annotation ladder's last rung. It echoes a nullable pin back when the
ladder claims its non-null part. It found that part with `nullablePartOf(name)`, which was the
last type-string parse in `emit_mono.vl` after #7606. It now reads the type:

- `ty` must be a `TyNullable`;
- the base is the naming rule's spelling of the nullable's inner (`monoPinSpellShaped`);
- the pin is echoed when `monoAnnPinName(base, inner)` returns `base` unchanged.

With no type, the rung answers "".

## Measured

The probe was the scratch compiler of #7606 (`2026-11-12-step7-l2-mono-narrowed-pin-by-type.md`),
never seeded. It ran on master `cf01f012` over 24,070 programs of the sweep population and counted
decisions.

| | decisions (programs) |
| --- | --- |
| reached | 1,378 (637) |
| typed, the two answers agree | 1,374 (635) |
| typed, the type says yes and the spelling says no | 2 (1): `generics/generic-union-param-litunion-alias-arm.vl` |
| no type | 2 (1): `globals/nullable-record-union-global.vl` |

**The disagreement.** The pin is `K|i32|null` in `nul<T>(p: T | i32 | null, …)`.
`nullablePartOf` splits only a two-member nullable, so the spelling declined it, and the rep
cascade then answered the same pin. The type accepts it. The module is byte-identical on both
seeds, and the program prints its 12 expected lines.

**The missing type.** It came from `monoNarrowedNulRecPinName`, which called `monoAnnPinName(n, -1)`
on the render of the narrowed nullable record. That call now passes the record's type `nt`. That
module is byte-identical on both seeds too.

**One unreached caller.** `monoArgTyNameProjected` builds `fnm + "|null"` for a nullable record
field. No program in the population reaches it. It now passes the field's element type
(`sFieldElemTyIxAt`) made nullable, or -1 when the field records none, so it does not silently
lose its pin to the no-type answer.

## Counts

- render-parse 13 / 36 → 13 / 35. `emit_mono.vl` is at 0 renders and 0 parses.
- pin-helper: 911 functions, unchanged.
- The `nullablePartOf` import leaves `emit_mono.vl`.

## What stays a spelling reader in `emit_mono.vl`

The annotation ladder `monoAnnPinName(name, ty)` still reads its name. Its rungs use:

- `arrElemNameRaw`;
- `isUNameKeyAB` / `isUNameDeclAB`;
- `variantIndexOf(name)`;
- the span tests.

None of these is in the render-parse ratchet. The probe of #7606 measured the ladder at 24 call
sites. At every typed call, the ladder answers the rule's spelling of the type as it answers the
passed name: 7,778 decisions, 0 disagree. So the next cut is the ladder taking the type. Two
groups of call sites stand in its way:

- **The callers that pass -1 with a non-nullable name.**
  - `monoNarrowedNominalPinName`'s declared record name: 30 decisions.
  - `monoArgTyNameRep`'s three `uVariants` row names: 39 decisions. The variant table has no
    type column to read instead.
  - `monoLoopVarRecordPin`: unreached.
- **The callers that pass a union row name rather than the rule's spelling.**
  `monoClosedTyName`'s `unNames` rung, 130 decisions. These name the union registry's rows, so
  they wait on the union key by type (w316).

## Proof

- **Locally:**
  - refresh to a fixpoint;
  - `lint-self.sh` clean;
  - render-parse 13 / 35, with the baseline written;
  - pin-helper 911;
  - late demands 8 (baseline 8);
  - seed size 6,736,049 bytes (+2.2% against the gate's baseline);
  - `mono-tyaram-grid.sh` 252 OK, 0 BAD;
  - `regress.vl`, no runs lost;
  - `check-filed-witnesses --strict` on both inventories: 4,847 as filed, 0 moved.
- **The sweep** is CI's (`sweep` label).
