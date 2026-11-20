# IR coverage: an atom operand of a string op (2026-11-20, lane IR4)

The `atom compare` first-miss class at merge-base c2f0a972f was 44 self-compile functions and 60
corpus functions. It mostly had nothing to do with comparing atoms. `atomEqPlanOf`'s `none` arm covers a
`+` with an atom operand, and an `==`/`!=` between an atom and a plain string. Legacy's dispatch
sends both to the string op, which writes each operand through `emitStrValue`.

## What changed

- **Dispatch.** `irBExpr` sends an atom operand to `atomCompare` only when `atomEqPlanOf`'s arm is
  not `none`. Otherwise the node goes to the string op builder, `buildStrBin`.
- **Operand route (IR-REV condition 1).** `buildStrBin` decodes a part when `exprIsLitAtom` says
  so, which is legacy's own predicate in `emitStrValue`. The part's rep is an assertion: it must be
  an `RAtom` or an atom's `K | null`. If the predicate and the rep disagree, the part misses with
  `string atom part route`. The decode is the delivery's atom arm (`deliverStr` → `deliver`), which
  already backs an atom delivered at a string.
- **Census.** `ir_build.vl` imports `TY_STR` beside `TY_BOOL`/`TY_I32`/`TY_NEVER`, so
  `phase-state-baseline.txt` has `surface` 7 → 8 for that module. The alternative was a checker
  import in `ir_build_ref.vl`, which had none.

## Why the decode is legacy's (IR-REV conditions)

- **(a) One decode for every arm.** `emitAtomToStr` (from `emitStrValue` when `exprIsLitAtom`)
  takes `atomStrPlanOf(ix, fnIx, ix == coerceHeld)`. All three of its arms reduce to the same
  three steps: write the atom, stash it with `setStrScrI(0)`, then `atomStrDecode(texts, nul)`.
  - Seated: `emitExpr` → `emitCoerced` `"atomstr"` → `emitAtomStrAtRecord`, then the tower or
    nul arm.
  - `emitNulAtomToStr`.
  - `emitAtomToStrTower`.

  The IR's `atomStrTail` is `setStrScrI(0); atomStrDecode(apTexts, apNul)` over the same plan.
- **(b) A part is never `coerceHeld`.** `coerceHeld` marks the node whose recorded coercion is
  being written. A concat or compare operand has no recorded coercion of its own, and the door
  guard checks only the fragment's root. So the IR plans with `held = false`, which is the plan
  legacy takes at the part.
- **(2) Mixed `==`/`!=`.** `emitStrEq` writes both operands through `emitStrValue`, so the
  compare uses the same decode as the concat.

## Grading

All numbers are fixpoint seeds: merge-base c2f0a972f against the head, 871f005ba. `+` only is a
scratch variant that admits only the `+` parts. It was measured one commit earlier, so its self
numbers are one function lower: `deliverStr` adds one to both sides.

| first-miss / count | base | `+` only | head |
|---|---|---|---|
| self covered = matched | 18,619 | 18,649 + 1 | 18,660 |
| self `atom compare` | 44 | 0 | 0 |
| self `string operand coercion` | 12 | 13 | 1 |
| corpus covered | 94,601 | 94,644 | 94,654 |
| corpus matched | 94,594 | 94,637 | 94,647 |
| corpus `atom compare` | 60 | 0 | 0 |
| corpus `string operand coercion` | 60 | 71 | 61 |
| corpus `string atom part route` | — | 5 | 5 |

- **The split.** `+` accounts for self +31 and corpus +43. Mixed `==`/`!=` accounts for self +10
  and corpus +10.
- **Corpus covered but not matched.** That count is 7 on both sides, the same functions; no
  `differ` row appears.
- **The 5 route misses** (6 lines including one `start`) are reads whose atom type and rep
  disagree. An example is a literal-set field stored at its `string` base by a layout family
  (`tests/cases/unions/layout-family-literal-set-beside-string.vl`). A route chosen by rep alone
  would decode them where legacy does not, or the reverse.

Matrices (`capability-matrix.vl`; each runs 64/64 under both seeds):

- `atom-in-string-concat`: uncovered goes 10 → 0.
- `atom-in-mixed-string-eq`: `atom compare` goes 10 → 0, and covered goes 134 → 144.
- `atom-nullable-in-mixed-string-eq`: a `K | null` part holding null. The checker refuses `+` on
  a `K | null`, so the nul arm is reachable only through `==`. Its 10 functions move from
  `atom compare` to `string operand coercion`, which is a named miss. The delivery's atom arm
  admits a `K | null` only into a `string | null`, and the string op takes a plain string.

| bar | result |
|---|---|
| `ir-identity --names` | identical 9,037, differ 0; self-compile identical |
| `ir-identity --cases` | identical 7,528, differ 0; witnesses 59/59 |
| master-vs-head tests/cases A/B | 7,596 programs, 7,528 built, differ 0 |
| mode 3 | identical; 18,660 claimed (master 18,619) |
| L2 fuel | 103,595,522,036 (+0.3% on baseline; master's run in the same box +0.2%) |
| plumb-shape cost | ok |
