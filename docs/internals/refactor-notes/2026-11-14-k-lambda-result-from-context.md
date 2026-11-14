# An un-annotated lambda takes the delivered result as its annotation, 2026-11-14

Lane K, bucket (f). Closes D3087 (clause 2) and D16310 (clause 1, nine fuzz findings of
2026-11-14). Files D16330–D16333. One mechanism. A lambda with no result annotation is typed by inference even where it
is delivered to a closed function type. Its returns are then a join, not deliveries. D3087's
readonly view over a captured `i32[]` is refused as a join. D16310's literal is built at the body's
own type while every reader uses the delivered result's rep, which gives an invalid module, an
`indirect call type mismatch` trap, or a false `is`. In every row, the annotated twin runs.

## Change

- **`lamRet` pin phase** (`check_fn_decl.vl`, `check_pins.vl`). The walk queues a lambda held to a
  closed contextual result when a value its body hands back is not of that type
  (`lamRetQueue`). The phase writes that result as the lambda's return-annotation node and
  re-checks (`lamRetApply`), so the checker and every emitter reader see the annotated twin. This
  works the way the literal phase writes its annotations.
- **What counts as a contract** (`check_expected.vl`). The following are recorded as guesses and
  not held to (`cbExpectedRetHeld`):
  - a union's function arm picked by arity;
  - a generic parameter's type under the bindings so far (`check_calls.vl`,
    `check_member_call.vl`).
  A literal result keeps its own adoption rule (D9520).
- **Load-bearing annotation.** A lambda the phase wrote counts its context's annotation as used
  (D1442), and the synthesized node gets no redundant-return hint.
- **Union arms are seeded at any resolved field** (`tyquery.vl`). `unionArmSeedSafe` declined a
  record arm with a list, union, nullable or map field. Those arms box and read back, as their
  annotated spellings show, so D16310's faces two and three reach their lambda.
  `unionNestedArmSeeds` seeds a list of lists of closures level by level, which fixes the ninth
  fuzz finding.

## Why a pin phase, not a seed before the body check

Checking the body against the contextual result from the start (as `fnDeclRetMode` does for a
`void` context) makes each row run. It also loses the counterfactual the D1442 rule needs: a
returned literal has already taken the context, so the redundant-annotation judge can no longer tell
whether the binding's annotation was load-bearing. That moved 56 fixtures' hints. The phase infers
first, so the natural types are known, and writes the annotation only where a returned value is not
of the contextual result. The round runs only in a program with a queued lambda.

- **Self-compile fuel:** master `4b94dbf0` at 87,063,757,255, this change at 87,116,961,044
  (+0.06%). The script's +12% against its baseline is master's own.
- **`vl_scaling_shape_test.ts`:** 90 passed. plumb-shape cost ok.

The rule keys on the lambda's result and the values it hands back (every `return` and an
expression body), not on a block tail, so it holds under the hybrid return rule.

## The contextual-adoption rungs

`finishInferredReturn` adopts the expected result per shape. Each rung was deleted alone and the
suite run:

| rung | fixtures failing without it | kept |
| --- | --- | --- |
| `numWidens` | 0 | deleted |
| `numLitUnionConvertsRet` | not tried | kept: a literal result is outside the rule |
| the f32 literal rung | 0 | deleted |
| `objRetWidenAdopt` | 19 | kept |
| the `Map()` tail | 0 | deleted |
| `inferRetAdoptNiche` | 34 | kept |
| the struct-element-list rung | 5 | kept |
| the general rung (#8069) | 3 | kept |

The three are deleted together with the suite green. The four kept rungs' fixtures involve literal-union
results, guessed seeds and nullable niches, which this rule does not hold a lambda to.

## Grading

Fixpoint seeds on both sides, `--before` master `4b94dbf0`.

- **The witnesses:** D3087 prints `1`. D16310's three faces print `1`, `6` and `true`. The nine
  family-A fuzz findings pass at their seeds, and the seven `fz2_a_*` cells of lane B's
  `fuzz-2026-11-14b` run (a union with one function arm is no guess, and a literal in a record
  field is no literal result).
- **An A/B set of 14 lambda shapes,** un-annotated against annotated: every pair agrees. The two that
  refuse refuse in both spellings (a `(i64 | null)[]` view, and D3088's nullable union).
- **New `lambda-result-at-delivered-result.matrix.vl`:** 42 cells that were SILENT or trapped on
  master now run. Runs go from 21 to 65 of 68 graded, with 0 runs→not-runs and 0 silent.
  `return_inferred` (annotated) refuses on both seeds; it is D16331.
- **`regress.vl`:** 3 of 12,013 cells move, `fz_a_witness`, `fz_a_trap` and `fz_a_is`, all to
  `runs`. 0 runs lost.
- **`rep-fuzz-check`:** exact.
- **The 227 templates over lambdas, closures, callbacks and views**, the seven
  `returned-hole-lambda-*` grids among them: 0 runs→not-runs. Lane T's three
  `lambda-at-closed-fn-type-*` templates: 0→26, 19→45, 19→45.
- **`deno task test`:** 8,938 passed, 0 failed.
  - Two refusal fixtures now anchor at the lambda's returned value with the annotated twin's
    message: `error-generic-list-written-lambda-return-misfit-in-generic-body`, and the last
    cell of `error-empty-object-in-union-join`.
  - `fn-value-adapter-at-wider-type` pins two hints that a re-check pass gets wrong (D16330).

## Not in this change

- D3088 (a captured nullable list as a readonly view) is refused in its annotated spelling as
  well, at the covariant-write rule's walk. D16331 is refused at the same walk.
- D2539, D2836 and D3396 are separate mechanisms.
