# IR: a value if's join at an open function type (2026-11-21, lane IR-D1)

Coordinator ruling, 2026-11-21: re-rank the open-type classes after #9373 and take the biggest
sub-shape.

## The re-rank

A debug build named the type at each open-type miss over every tests/cases program at master
7211b992: 539 rows in 151 files.
- (A) 247 rows, about 105 files: a value `if` whose join variable has an open function type, a
  fn-choice or hole-lambda arms (`f = if c { (x) => … } else { … }`). `ifExprAt` (207) and
  `ifRefExpr` (39) still asked `irTyOpen(ty)` with no rep, where every variable site asks
  `irTyHeldOpen(ty, rep)`.
- (B) 289 rows: hole function types at the closure rep in programs that hold records of
  closures. That is the build-wide test IR-N6 kept for holder, returned and member records;
  it is IR-N6's.

## The change

`ifExprAt` and `ifRefExpr` ask `irTyHeldOpen(ty, rep)` at the join's rep, the rule the
variable sites already use (#9373): an open function type at the uniform closure, or a tagged
set's id, is held.

## Measured vs master 7211b992 (fixpoint seeds on both sides)

| population | functions | start bodies |
| --- | --- | --- |
| self-compile | 19,389 → 19,389 | 138 → 138 |
| distilled | 44,299 → 44,301 | 8,026 → 8,026 |
| tests/cases | 60,547 → 60,686 | 4,361 → 4,396 |
| capability probes | 490 → 490 | 139 → 140 |
| filed witnesses | 17,393 → 17,422 | 3,261 → 3,296 |

First misses across the populations:
- `open temp type`: 374 → 35;
- `open parameter type`: 247 → 247 (B);
- `open local type`: 95 → 95 (B);
- `claim fell back`: 3 → 3.
