# L5 step 4a: the record-adoption rows are two lifetime records, 2026-11-15 (lane Q)

The first slice of step 4 of `2026-11-14-phase-products-design.md` §3: "lifetimes are records", so
a reset is one assignment and not a hand-kept list.

## Change

`check_rec_adopt_rows.vl` kept its rows as 34 module tables with two resets:

- `recAdPassReset` cleared 25 of them one by one. They are now `recAdPass: RecAdPass`, and the
  reset is `recAdPass = recAdPassNew()`.
- `recAdReset` also cleared 9 that last the whole program's check. They are now
  `recAdProg: RecAdProg`, and the reset is `recAdProg = recAdProgNew()`.

The three flags neither reset touches (`recAdSetGrps`, `recAdRaising`, `recAdPinInit`) stay as
they were. The rows' readers in 8 modules read `recAdPass.<field>` and `recAdProg.<field>`, and
each import clause names the record instead of up to 25 tables. The field comments are the old
declarations' comments.

## Why this module first, and what step 4 can delete

A lifetime record deletes lines only where the tables are imported widely or cleared in more than
one place. Otherwise a module's own declarations and its reset turn into a type and a constructor,
line for line. I ranked the `*Reset` functions by the import lines a record would collapse:

| reset | tables | import lines |
|---|---:|---:|
| `collectUReset` | 46 | 235 |
| `crReset` | 75 | 174 |
| `emitStateReset` | 76 | 163 |
| `esReset` | 38 | 78 |
| `recAdPassReset` | 25 | 55 |

This was the largest one whose importers no open PR touched. `crReset` and `esReset` are next,
once their importers are free.

## Gate

- **Seeds:** A is a fixpoint built from `git archive 6015bf3ed`; D is a fixpoint built from this
  branch. Both took three rungs from the stale fetched seed.
- **Identity:** `probe-rollback-census.ts --fingerprint` over `tests/cases`, `distilled/cells` and
  `distilled/named` gives **20,233 programs, 0 different**.
- **L2:** the L2 build of A's tree is identical under A and D. Guest fuel 87,458,308,980 (A) and
  87,458,553,838 (D), +0.0003%.
- **Other checks:** `lint-self.sh` clean; `regress.vl` no runs lost; `deno task test` (8,965 passed); `phase-state-census --check`
  ok; the emitter-state audit test passes.

## Lines

**+301 / −347, net −46** over 9 modules.

## The probe-rollback map census sees record fields

`tests/vl_probe_rollback_test.ts` classifies every module-level `Map()` a quiet probe can reach,
using `scripts/probe-map-classes.tsv`. Four of these maps are now fields of `RecAdProg`, so the
scanner also reads the map-typed fields of a record type that a module-level `let` holds, keyed
`module:Type.field`.

The four rows are renamed accordingly (`check_rec_adopt_rows:RecAdProg.noAdopt` and so on), with
their class and reason unchanged. A table moved into a lifetime record therefore stays classified
instead of silently dropping out of the census.
