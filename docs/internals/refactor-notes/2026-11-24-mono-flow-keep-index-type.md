# Mono: a computed-index read's kept copy answers its original's type, 2026-11-24

Lane IR-N6, `rep ?` (B1) at the cause. `monoFlowKeepIndex` (`emit_mono.vl`) runs a copy of a computed-
index read `x` as its own statement, just before the statement holding its call. It mints that copy
with a bare `mkIndex`, in two places: `kept` for a body statement and `gk` for a module-scope one.
Neither recorded a type. The IR missed the kept statement as `rep ?`, for example the spread copy's
`ys[0](2)`, where `ys` is a spread of a list a generic function was pushed into.

## The mechanism

`nodeTyCarry(kept, x)` and `nodeTyCarry(gk, x)`: the copy answers its original's type, as
`monoRemintCallTpl` and `monoRemakeListLitTpl` do for theirs. That is two lines, with no new
function, so the pin-helper budget is unchanged.

## Legacy tails the IR calls

None new.

## Nodes newly typed

Counted with a scratch counter compiler built from an archive copy:

| population | programs | nodes newly typed |
| --- | ---: | ---: |
| tests/cases | 7 | 18 |
| distilled corpus | 0 | 0 |
| self-compile | 0 | 0 |

## Readings (fixpoint seeds on both sides, master 80d557f6f)

- Identity:
  - `ir-identity --names`: identical 9,433, differ 0; the self-compile is identical.
  - `--cases`: 8,148 identical, differ 0.
  - The `tests/cases` A/B: 7,869 identical, differ 0.
  - Mode 3: corpus and self-compile identical.
  - The legacy moved list is empty.
- Claims:
  - tests/cases covered 88,028 -> 88,029; matched 88,017 -> 88,018.
  - Corpus 46,923 -> 46,923.
  - Self ir misses 0.
  - No program loses a function; `closures/generic-list-spread-copy-written-inside-function.vl`
    gains one.
- `mono-tyaram-grid.sh`: 252 of 261 pass, the 9 REJECT as before, no BAD cells.
- rep-fuzz exact; regress: no runs lost.
- L2 fuel -0.00% per PR; late demands 10 of 10, late tag rows 315 of 315.

After merging master (with #9973; same file, different lines, a mechanical merge):
- `gate --fast` passes, `ir shadow cases` and `ir claims` among its rows.
- `--cases <seed>`: 8,169 identical, differ 0.
- `--claimless`: identical 14,514, differ 0.
- `check-filed-witnesses --strict`: 5,702 graded, 0 MOVED.

## Position sweep

`scripts/capability-probes/matrix/spread-copy-index-callee.matrix.vl` has these cells:
- the copied callee's result at return, `let`, argument, concat, interpolation, `if` arm, record
  field and closure result;
- a module-scope copy, for the `gk` arm;
- the copy called at two types.

66 of 66 graded cells RUN before and after. Armed, `rep ?` goes 14 -> 0 and covered 282 -> 296, all
matched. Two other classes are left, outside this change: `array spread source rep` (2, the copy
called at two types) and the module-scope start's `push operand coercion` (2).

Witness: `tests/cases/closures/spread-copy-of-generic-list-called-at-each-kind.vl`. Shadow row:
`tests/ir-shadow-rows/spread-copy-index-callee.vl`, which reads `uncovered rep ?` on the base and
2 of 2 matched on the candidate.

Legacy lines deleted: 0. Moved to `@ir`: 0.
