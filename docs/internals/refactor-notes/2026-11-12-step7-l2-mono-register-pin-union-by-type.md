# Step 7 L2 §7: `monoRegisterPinUnion` asks the type whether a pin is a union, 2026-11-12

w310's union-reader census (`2026-11-12-step7-l6-name-readers-census.md`) ranks
`monoRegisterPinUnion`'s `unionSetAtomsOf` first: 7,220 programs reach it, and 6,080 of them with
a name no row holds. The parse only counted the set's atoms, where fewer than two means "not a
union, register nothing". The type now answers, inline: true for a
`TyUnion` or a `TyNullable`.

The base is master `89b998a50`.

## Measured before the cut

A probe recorded every call with a union spelling and no type, and every call where the spelling's
answer (two or more atoms) and the union-type predicate disagree. It ran over all 7,823
`tests/cases` programs and over the compiler itself (`vl check --codegen compiler/entry.vl`).

- No call had a union spelling and no type. The compiler itself reaches the site with no
  disagreement.
- 312 programs disagree, at 465 reaches. All of them are of two kinds:
  - **Two or more atoms, not a union:** `X|null` nullables, which the existing
    `monoTyIsUnionOrNulUnion` excludes by design. So the inline test counts any
    `TyNullable`.
  - **One atom, a union:** a declared alias spelled by name (`K`, `AB`, `Shape`), a spaced literal
    union (`"a" | "b"`), and a few collapsed spellings. These now reach registration, whose first
    rung adopts the row the type already keys to.

## Graded

- **A/B:** all 312 disagreeing programs, run against a seed built from the same master sources.
  0 differ in output.
- Seed: fixpoint. `lint-self`: clean.
- `regress.vl`: no runs lost, 0 → silent.
- Late demands: at baseline.
- `check-filed-witnesses --strict`: 4828 as filed, 0 MOVED, 0 output mismatches.
