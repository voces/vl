# Step 7 L6 (lane G, cut 4b): the inline union registrar's value-union verdict by type, 2026-11-12

Stacked on cut 4d (#7630). `registerInlineUnionGo` registered a value union when
`isValueUnionTyOr(sty) == 1`, or when its spelling read as one (`isValueUnionName`,
`nameIsLitUnionArmValueUnion`). It now asks the type alone:
`isValueUnionTyOr(sty) == 1 || riuValueOfBases(sty)`.

## Why the type verdict alone was not enough

`isValueUnionTyOr` counts a literal at its base only beside a member that is not a literal
(`valueUnionLitsAtBase`). A spelling always writes an integer literal at its base. So a union of
literals alone read as a value union by name and not by type, in 120 calls in 95 programs:

- `N2 | null` with `N2 = 1 | 2`, spelled `i32|null`;
- `9000000000 | 1`, spelled `i64|i32`;
- `"a" | 1`, spelled `string|i32`.

D11241's witness is in this class.

## The rule

`riuValueOfBases(sty)` applies when every non-null member, nested unions flattened, is a string or
integer literal, or a list whose elements are all literals of one base. Each such member counts at
its base (`litBaseTy`, or that base's list). The union is a value union when it has two or more
bases, or one numeric base beside `null`. The second case mirrors `valueUnionVerdict`: a nullable
string or boolean is a niche, not a box.

A first candidate counted every canonical member at its base. It also called `string | null`,
`K | null` and nullable closures value unions: 5,099 calls in 1,763 programs. It was dropped.

## The census

A probe compiler, built in the scratchpad and never refreshed into a seed, ran this rule beside
the name rule over the sweep list (24,020 programs graded):

| | calls |
| --- | --- |
| agree (no / yes) | 16,666 / 9,576 |
| the name only: `i32[]|i32` in `distilled/named/d362al_numlitun_unionmem.vl` | 3 |
| the type only: `W | null` with `W = 1 | 2 \| 5000000000`, `literal-unions/coalesce-litunion-int-default-arith.vl` | 1 |

- **The name-only calls** are `Z[] | i32` with `Z = 0 | 1`, spelled `i32[]|i32`. The registrar is
  handed that union. `isValueUnionTyOr` declines (-1) on it, because `valueRowKind` has no kind for
  a list of a literal union, and `riuValueOfBases` does not apply, because `i32` is no literal.
  So the type no longer calls it a value union. The program builds byte-identically: the
  registration was redundant. Folding a list of one literal base into the typed verdict
  (`valueUnionVerdict`) would close the decline; that is the checker's verdict, not this cut's.
- **The type-only call** keeps the alias `W` as one atom in its spelling.

Both programs print what the base prints.

## What the registrar reads its name for after this

The inline union is keyed by its type. Its name is read for three things only:

- the row's display name (the mint);
- `isUNameKeyAB`'s A/B tally, a label;
- `unNameAdoptTyKeyRow`, which binds the spelling to the row the type found. That is a contract:
  the spelling index exists so that a source name resolves to its row.

## Graded by output

These 7 programs ran on the base seed and on the candidate, and 0 differ:

- the two programs that moved;
- D11241, D3512 and D5714;
- `coalesce-numeric-binding.vl` and `coalesce-hole-call-litunion-join.vl`.

## Proof

- **Seed:** fixpoint.
- **Locally:** lint-self, regress, rep-fuzz, check-filed-witnesses `--strict`, late-demands,
  seed-size, render-parse, dead-exports, emitter-state-audit.
- **The full sweep:** CI's `sweep` label. The expected movers are the two programs' bytes.
