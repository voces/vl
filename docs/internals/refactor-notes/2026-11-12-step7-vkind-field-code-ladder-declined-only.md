# Step 7, lane H, cut 2: the field-code ladder keeps only the arms the descriptor declines to, 2026-11-12

Cut 1 (`2026-11-12-step7-vkind-field-code-ladder-typed.md`) left the field-code ladder reached
only with a type. Two callers still asked it directly:

- `funcTypeShapeLowerable` (`emit_shape_intern.vl`);
- `internShapeAs`.

Each called `nameFieldCode`, never the rep descriptor (`fieldCodeOfTyCovered`) that
`nameFieldCodeTy` asks first. So the ladder's spelling arms still answered types the descriptor
codes. This cut routes both callers through `nameFieldCodeTy`, then deletes the arms no declined
type reaches.

It stacks on cut 1 (#7609). The base is that branch merged with master `1cfe43d1`. Both seeds
are fixpoints.

## Census

The probe compiler was scratch, never refreshed into a seed. Its accumulator was emptied per
program and the channel was checked against a control. The population is the sweep's, 24,070
programs, and each count below is of programs.

**Routing the direct callers through the descriptor**, before the switch:

| caller | reached | the descriptor's code differs from the ladder's | the caller's answer changes |
| --- | --- | --- | --- |
| `funcTypeShapeLowerable` | 313 | 32 (a nested record: the descriptor codes 15, the ladder -1 and recursed) | 5 |
| `internShapeAs` | 46 | 0 | 0 |

The 5 changed `funcTypeShapeLowerable` answers are in programs that run, and they print the same
before and after.

**The ladder's arms after the switch.** Each arm is tagged; the only caller left is
`nameFieldCodeTy`, after the descriptor declines:

| arm | programs |
| --- | --- |
| list, ref list (5) | 53 |
| list, scalar wrapper | 18 |
| no type (-1) | 12 |
| `isValueUnionName` (16) | 9 |
| `S[] \| null` (28) | 2 |
| `isUNameDeclAB` (16) | 2 |
| nullable scalar list (31–36) | 1 |
| every other arm, and the ladder's -1 | 0 |

## What changed

- **The two callers** ask `nameFieldCodeTy`.
- **`nameFieldCode`** is the declined-type ladder. It is reached only from `nameFieldCodeTy` and
  holds the seven arms above. `fieldCodeOfSpelling` is folded into it.
- **The 22 unreached arms are deleted:**
  - the six scalar spellings (`i32`, `null`, `boolean`, `f64`, `i64`, `f32`);
  - `nameIsInlineLitUnion`, `tyIsLitUnion`, `nameIsOneStrLit`, `nameIsString`;
  - the map, nullable map, nullable i32 list, nullable string, nullable boolean and nullable
    literal-union arms;
  - `nameIsStructDecl`, `armFieldStructRow`, `armFieldDeferredRowOk`;
  - `nameFieldCode`'s nullable-closure, tagged-set and closure arms.
- **D1518's deferred predicate** is deleted with its only caller: `armFieldDeferredRowOk`,
  `armDeferStack`, `armPlainLayoutTyOk` and `armRefLeafNameOk`. `nameIsString` (`emit_base.vl`)
  loses its last caller and is deleted.
- **The loud floors.** The field type is in hand in each case; each answered silently before, and
  no program in the population reaches any of them.
  - `nameFieldCodeTy` fails loudly when a declined type reaches no rung. It answered -1.
  - `funcTypeShapeLowerable`'s nested-record recursion fails loudly; it recursed into the field's
    spelling. 0 programs reach it, since the descriptor codes every closed record.
  - `variantNestedShapeOkTy` is called only for an uncoded field, so no program calls it. It is
    a loud floor; it walked the field's spelling.
  The last two were three of `nonNulBaseOf`'s callers. That spelling parse leaves both
  functions.

## Measurement

- **Sweep** (`sweep.vl diff`, fixpoint seeds both sides): 24,170 same, 0 bytes-only movers,
  0 output movers, 0 `runs → not-runs`, 0 new compiler traps. The step that only routes the
  callers was also byte-identical on its own.
- **Seed:** 6,724,704 → 6,722,304 bytes (−2,400) against cut 1's head merged with master
  `2c252adf`, a fixpoint. The final sweep (24,178 programs, the same two seeds) is 24,178 same.
- **rep-classifier-census:** NAME classifiers 38 → 37 (71 → 70 call sites); ARENA + NAME stays
  at 11; ARENA + SPELLING stays at 0.
- **render-parse:** unchanged at 13 renders and 34 parses. The deleted arms' readers are not
  among the census's parsers.

## What is left in the ladder

- **Two spelling reads,** `isValueUnionName(t)` and `isUNameDeclAB(75, t)`: the union registry's
  name lookups. They are not floors. They convert to the registry's typed readers when lane G's
  cuts 3–4 land.
- **The ref-list, scalar-list and nullable-list arms** answer from the type. They are the
  descriptor's B171 domain: a nullable element (`(i32|null)[]`) and a record or union element the
  descriptor's array arm declines.
