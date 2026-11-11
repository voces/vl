# Step 7 L2 §7: what keying the inline-shape interner by type would merge and move, 2026-11-11

The inline-shape interner (D6, `internInlineShapeTyGo`) finds or mints a struct row under the
spelling the shape walk descends on. The walk's five type-string parses in
`emit_shape_intern.vl` exist to produce those spellings. This note counts what would change if
the interner found its row by type instead, through `structRowOfRecordTy`, the row-find the
struct registry already keys by type.

The base is master `ebbc4bc2`. The population is the sweep's `cases` population.

## Probe

The probe ran in a scratch compiler that was never refreshed into a seed, using the
accumulator of the predicates note. Before each of the interner's four outcomes, it asked
`structRowOfRecordTy(fieldsTy)` and compared that row with the one the interner chose. The four
outcomes are: the field-set find (`annShapeIndexOf`), the same-type find (`annSameTypeRowOf`),
the wider `#anon` row (`annShapeWiderRowOf`), and a new mint.

1,509 programs reach the interner's find. In 89 of them at least one find disagrees with the
type key. Programs per outcome (one program can show several):

| outcome | agrees with the type key | disagrees | the type has no row | untyped |
| --- | --- | --- | --- | --- |
| field-set find | 1,373 | 29 (a different row) | 15 | 3 |
| same-type find | 191 | 5 (a different row) | — | — |
| wider `#anon` row | 1 | — | 3 | — |
| new mint | 1,240 (the type has no row yet) | 57 (the type already has a row) | — | 3 |

## What the disagreements are

- **Mint over an existing row, 57 programs.** The interner mints a second row although the type
  already has one. Often both rows carry the same spelling: `{n:i32,next:O|null}`,
  `{r:{c2:i32}|{s2:i32}}`, `{i:{p:i32},n:i32}`. Otherwise the existing row is a literal's
  `#anon` row, as with `{a:{b:i32}}` and `{xs:{n:i32}[]}`. A type key would merge these into one
  row.
- **A different row, 29 + 5 programs.** The field-set find returns one of two rows with the same
  spelling, while the type key names the other. The same happens between two `#anon` rows
  (`{f:()=>string}`: `#anon1` against `#anon0`). It also happens across a value type the field
  codes do not tell apart (`{f:(i32)=>i32}` against `{f:(i32)=>f64}`).
- **The type has no row, 18 programs.** The name finds a row that the type does not reach. A
  type key would mint here, unless the find learns the alias the name took.

## What it means for the re-key

A type key is not byte-identical. It merges same-spelling twins and `#anon` rows in 57
programs, and it moves the row a find returns in 34. Most of these look like duplicates the
type key would remove, but each one is a module change to grade. The re-key is cut in this
order, one PR each:

1. Find by type first, and fall back to the name.
2. Mint only when the type has no row.

Each is graded on the sweep's movers. The key's shape (canonical type, plus declaration for a
nominal record) is coordinated with lane w319's struct-row key.
