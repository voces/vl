# Step 7: `arrLitElemKindTpl` cannot yet read the literal's recorded type, 2026-11-11

`arrLitElemKindTpl` (`emit_value_sites.vl`) keys a list literal's element kind (`RLK_*`) from
the literal's shape. Its ambient fall-through reads `uDeclared`. The step-7 candidate answers
`refListElemKindOfTy(tyArrayElemIx(nodeTyIxOf(arrIx)))` instead, whenever that has a kind, and
drops the fall-through. This note grades that candidate. The candidate is refused, and D15800
pins the reason.

## Where they disagree

A probe at the template's call (`arrLitElemKind`, no frame type) fires on 268 cells of the
23,910-program sweep population. Classes are codec kind > recorded-type kind; -1 means the
type has no kind, and -99 means no array type is recorded.

| class | cells | class | cells |
| --- | --- | --- | --- |
| 4>9 | 97 | 1>-1 | 4 |
| 1>2 | 60 | 2>-1 | 3 |
| 4>6 | 37 | 3>2 | 2 |
| 4>7 | 22 | 4>11 | 2 |
| 7>4 | 16 | 7>-99 | 2 |
| 1>-99 | 12 | 6>9, 7>10, 7>9, 2>1 | 1 each |
| 8>4 | 11 | | |
| 4>-1 | 4 | | |

By origin, the largest class (4>9) is mostly `tests/cases/closures` (31) and the D15204,
D15201 and D592 named sets (28).

## The deciding run

A switched compiler, which answers the recorded-type kind when there is one, is swept over the
whole population against the same tree's fixpoint seed. 13 cells move:

- **3>2, 2 cells: runs → compiler trap.** These are D15540's row and
  `tests/cases/maps/map-twin-union-is-its-one-map.vl`. Here the codec is right. The recorded
  type `LM | IM` is also right, but `rlUnionElemKindOfTy` boxes it, while D15540 stores it as its
  one map. Filed as D15800, a refutation pin.
- **4>9, 4 cells: the same output, a different module.** The codec's build keys an extra
  i32-list wrapper type that the recorded-type build never emits. Both run, but the switch is
  not byte-identical.
- **7 cells:** they reject with a leftover probe in the scratch tree, under both the probe and
  the switch. They are an instrument artifact, not a movement.

In every other class, including all 60 cells of 1>2, the switched build is byte-identical:
the same outcome, stdout and module.

## What would let the switch land

`rlUnionElemKindOfTy` would collapse D15540's twin pair (a literal-union map and its base) to
the map, and the 4>9 wrapper difference would be ruled or kept. Then the candidate could be
re-swept for identity.
