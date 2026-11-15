# The hybrid return rule: lane D handoff, 2026-11-15

This branch, `lane-d-return-rule`, holds the flag-day work. It is not ready to land: the
migrated tree still loses `runs` on cells whose `return` spelling master cannot lower.
The design is in `2026-11-14-hybrid-return-rule.md`. The owner ruled A1, A2 and A3 as
recommended there, and its census table is superseded by the counts below.

## What is done

- **The rule**, behind `RETURN_RULE = false` (`compiler/return_rule.vl`):
  - A block body's last statement is a statement. A value tail where a value is wanted is a
    type error with `--fix` (A3, no lambda exception). A discarded pure tail warns
    `this value is discarded; did you mean \`return …\`?` (A2).
  - Braces after `function` are always a block. After `=>` they are an object only when they
    hold a field list (`looksLikeFieldList`), and `{}` is a block (A1).
  - `rrIsBlockBody` is the one predicate every rule gate reads.
  - A last `return` keeps the tail position in the checker and the emitter.
- **The codemod**, `vl check --fix --migrate-return`, run with a rule-off seed:
  - It inserts `return` before each tail today's rule returns, rewrites a `function` form's
    object body to `{ return { … } }`, and writes `; return name` after a named function that
    ends a body.
  - A mixed `if`, one whose arms do not all yield a value, gets a `return` in each value arm.
  - It skips checker-minted functions (`rrMinted`) and goes before a label or opening parens.
  - It applies only its own edits and keeps every one, without a trial build: today's emitter
    is not the judge of a `return` it cannot lower.
  - Applied twice, it changes nothing the second time.
- **Checker fixes the rule needed:**
  - `checkTrailingChainTotal` runs on a rule-mode last statement. Without it a non-exhaustive
    `is`-chain was accepted (clause 1).
  - A returned `if` is graded arm by arm only when it yields on every path. An else-less one
    that can fall through stays an `i32 | null` value, refused at `i32` as on master.
- **Compiler-built bodies:** the adapters and forwarders (`mkExprBody`) are expression bodies.
- **Dropped:** folding a final `return e` into the tail `e`. It cost 32 cells that already
  ended in `return` on master, and it silently discarded an explicit `return 7` at `() => void`
  (clause 1).

## Dry-run counts

These are `return` insertions, applied with the committed codemod:

| tree | sites |
| --- | ---: |
| `compiler/` | 15,490 |
| `std/` | 130 |
| distilled corpus | 2,888, 14 of them object bodies |
| `tests/cases` | 8,448, 27 of them object bodies |
| capability probes | 597 |
| `bench/` | 58 |
| other `.vl` (tests/fixtures, scripts, census) | 1,772 |
| ` ```vl ` fences and `Repro:` blocks | 2,435 in 1,883 of 5,873 blocks |

Arrow `{ name }` bodies that change meaning: 0. With the rule on, the migrated compiler
reaches a fixpoint (L2 == L3).

The `tests/cases` grade compares the original tree under the flag-off compiler with the
migrated tree under the rule-on fixpoint seed. Of 8,074 cells, 7,947 are the same and 109
already failed and still fail, with another message. None goes from not-runs to runs, and
18 go from runs to not-runs.

## The 18, by cause

- **Closed by #8236 (D16183)**, a `return` of a write: `capture-mutation-tail-write`,
  `capture-param-and-no-init-writes`, `captured-litunion-assign`,
  `simd/captured-reassigned-vector-cell`, `literals/hex-width-through-tail-write-f64`.
- **This branch's own**, which pass on master: `literals/hex-width-through-value-if`,
  `literals/if-join-literal-arms-at-destination-width`, and
  `statements/error-void-if-arm-annotated-return`, whose type error becomes an emit error.
  Suspects are `emitRetIf` (`wasmEmit.vl`, the RetStmt arm) and the arm-by-arm grading in
  `checkRetStmtNode`.
- **Master's `return` path, with lane R1:** a returned value `if`, lowered whole where the
  tail `if` is lowered arm by arm (`lastStmtIsValueIf` → `emitIfTail`). Cells:
  `conditionals/tail-if-field-assign-arm`, `literal-unions/atom-widened-at-tail`,
  `unions/litunion-mixed-width-into-wider-number`, `expressions/if-arm-member-call-value`.
- **Master's `return` path, with lane R2:** inference, in
  `lists/map-boxed-ref-element-result`, `soundness/tail-if-arm-legal-returns-run`,
  `generics/generic-return-map-value-tyaram` and
  `closures/tail-value-join-of-records-of-fn-fields-called-through-result`. Plus the
  singletons `maps/untyped-record-literal-stored-beside-narrowed-get` and
  `closures/captured-cell-nullable-litunion-print`.

## The dry-run method

1. Copy the tree with `git ls-files | tar` into a scratch dir.
2. Run `vl check --fix --migrate-return --compiler <rule-off seed>` on every `.vl` file, with
   `VL_STD` set to the copy's `std`.
   - Run files whose import graph is being rewritten one at a time. A parallel `--fix`
     reads a half-written import, and that file is skipped without a word.
   - Then re-run a check-only pass (`--severity info --migrate-return`) to find stragglers.
     Its count is also the idempotence check.
3. Extract fences and `Repro:` blocks to files, migrate them the same way, and splice them back.
4. Set `RETURN_RULE = true` and build the fixpoint from the rule-off seed.
5. Grade each cell's exit code and output hash, the original tree under the rule-off seed
   against the migrated tree under the rule-on seed.

## To do before the flag-day PR

- Fix the three cells this branch caused. Re-grade once R1 and R2 land, until the 18 are 0.
- Name the defaults of the two ladders `kind-ladder-incomplete` flags in `compiler/parser.vl`:
  `looksLikeFieldList` and `skipFieldExpr`.
- Migrate the VL embedded in `.ts` test strings. Find it by running the suites on the
  rule-on tree.
- Run regress with the rule on, L2 fuel, seed size, net compiler lines and the emit_mono
  function count (908 on master).
- Fold the flag: delete `RETURN_RULE`, `RR_A1` to `RR_A3` and the migration machinery. Keep
  the codemod reachable from a pre-flag-day seed.
- Correct the census in the design note, and add the ROADMAP backlog line "a user-facing
  `vl` command for the implicit-return migration (external repos, AE-001)".
- File D16184 (open, clause 1, both spellings) independently of the flag day.
