# The hybrid return rule: design note for the flag day, 2026-11-14

Lane D. Owner ruling, 2026-11-14:
1. An expression-bodied lambda `(x) => expr` keeps its expression as the value.
2. An `if` or `match` arm in value position keeps its last expression as the value.
3. A function's block body (`function f() { … }`, `(x) => { … }`) returns a value only through
   `return`. With no `return expr`, it returns nothing.

Recorded in DECISIONS.md, "A function's block body returns a value only through `return`" (#8139),
with lane O's interaction: falling off the end of a body whose declared type admits `null`
returns `null`. This settles `open-rulings.md` §`bare-block-as-expression`: a trailing bare block
is a statement. D3477 closes as DESIGN. Nothing is built yet; this note comes before code.

## Assumptions, pending the owner

Three details are open with the owner. This note assumes the coordinator's recommendation on each.
Every place an assumption decides something is tagged with its label, so each can be flipped
alone.
- **[A1] Braces after a signature are always a block.** `function makePoint() { x: 3 }` is a
  block body, and the record is `return { x: 3 }`. Flipped, `looksLikeObject` keeps that form as an
  expression body (rule 1). The codemod then skips it, and the A1 row of the table goes.
- **[A2] A discarded pure tail warns.** It is a warning with `--fix`, not an error. Flipped to an
  error, the `discarded-tail-value` severity changes and nothing else does. Flipped to silence,
  that diagnostic goes.
- **[A3] Callbacks get no exception.** `xs.map((x) => { x + 1 })` is a `void` lambda where a
  value is wanted, so it is a type error. Flipped, a block-bodied lambda checked against a
  non-void function type would keep its tail as the value. That is the one contextual rule
  the codemod would then have to leave alone.

## The rule, position by position

| form | value |
| --- | --- |
| `function f() expr`, `(x) => expr` | `expr` (rule 1; the parser's synthetic body `Block`, position `-1`) |
| `function f() { …; e }`, `(x) => { …; e }` | none; `e` is a statement and is discarded |
| `return e` anywhere in a body | `e` |
| `if`/`match` in value position (`return if …`, `const x = match …`, an argument) | each arm's last expression (rule 2), at any depth |
| a labelled block `@B { … }` in value position | its `break @B v` values and its tail, unchanged: it is an expression, so rule 2's reasoning applies |
| a loop carrying a value, in value position | unchanged |
| a bare `{ … }` statement | a statement, everywhere (D1901, D1902) |
| a tail that diverges (`never` call, `__trap__()`) | no `return` needed: the body is total by its exits, as today |
| a block body whose declared type admits `null`, falling off its end | `null`, as today (lane O, #8139) |
| `function f() { x: 3 }` **[A1]** | a block body: `x: 3` is not a statement, so it is refused, and the record is `return { x: 3 }` |

Three consequences:
- **The void-context discard rule** (DECISIONS 2026-08-31, "VOID CONTEXTS DISCARD IMPLICIT TAIL
  VALUES") becomes moot. A block body never has a tail value to discard. Its `return expr`
  half stands unchanged.
- **"Assignment is an expression yielding its right-hand side"** (DECISIONS) keeps the
  expression. Its example "a function whose trailing statement is an assignment returns the
  assigned value" becomes `return count = count + 1`.
- **"AN ELSE-LESS `if` THAT ENDS AN ARM IS A VALUE"** (2026-09-22) now applies only in value
  position: `return if c { 5 }` is `i32 | null`. A body ending in `if c { 5 }` is a statement.

## Checker and emitter change

- **Checker.** `fnDeclCheckBody` stops treating a block body's last statement as a return
  position: `tailIsReturn` holds only for the synthetic expression body. An un-annotated block
  body infers from its `return`s alone, and is `void` with none. `nodeIsTotal` for a block body
  asks only about exits.
- **Emitter.** `emitFuncBody` drops its implicit-return ladder for block bodies: the
  value-tail, value-`if`, member-call (D1240) and else-less-nullable arms. Their tail-aware
  lowering stays for `return if …` and for arms through `emitStmtsTail`, so most of the code is
  kept, reached through `return`.
- **Expected deletions** (to be measured, not promised):
  - the D1240 arm;
  - `seedTailArms`'s body-tail call, which a `return` seeds instead;
  - the void-body discard marking in the body loop;
  - `fRetVoid`'s `fnPosResultUnconsumed` voiding;
  - the `braceName` fall-off hint (`{ id }` at a body tail is a block statement, and
    `return { id }` is the record);
  - the inferred-tail witness path for block bodies.

## Diagnostics

- **An annotated non-void function whose block body ends in a value expression without
  `return`.** Error, at the expression: "`f` returns `i32`, but a block body returns only through
  `return`: write `return <expr>`". It carries a `--fix` that inserts `return `. This replaces
  "not all code paths return a value" for that shape. A body that can fall through after
  `return`s keeps the existing sentence.
  - **The error also fires when the declared type admits `null`.** `function f(): i32 | null
    { 5 }` would otherwise fall off its end and return `null` silently, under lane O's rule.
    A tail that is a value expression is refused there too. An exit-less fall-through with no
    value tail, such as `if c { return 1 }`, still returns `null`.
- **An un-annotated block body whose discarded tail is a pure value** (a name, literal,
  operator, field read or record), so the author almost certainly meant it as the result.
  **[A2]** Warning `discarded-tail-value`, with the same `--fix`. A tail call stays silent: a void
  callback ending in `xs.pop()` is the case the 2026-08-31 rule was written for.
- **A block-bodied lambda where a value is expected** **[A3]**: `xs.map((x) => { x + 1 })` is
  `expected (x: i32) => U, got (x: i32) => void`. It gains "the lambda's block body returns
  nothing: add `return` to its last expression", with the `--fix`.
- **A caller that uses a now-`void` result.** The existing `print expects a value, got void`
  gains "`f`'s block body returns nothing: add `return` to its last expression" when the callee
  is a block body ending in a value.

## The codemod

`vl check --fix` with a new lint rule `implicit-return`. It runs on today's checker: wherever a
block body's last statement is today's implicit return, it inserts `return ` before it. The
census below used the same rule. It is idempotent by construction, since a tail that is a
`return` is not flagged.
- **Edge spellings, checked on master:** `return if … else …`, `return match …`,
  `return @B { … }`, `return x = e`, `return { id }`, the else-less `return if c { 5 }`, and
  `return while …` with a `break` value all parse and run on their own lines. One does not
  parse: the else-less `if` on a single line, `{ return if c { 5 } }`. Either the parser learns
  it, or the codemod breaks the line.
- **Proof on the whole tree** (step b):
  - the codemod applied twice changes nothing the second time;
  - `refresh-compiler.sh` gives a byte-identical seed, since `return e` and the implicit tail
    lower alike;
  - every `tests/cases` expectation is unchanged;
  - regress, the capability matrix and the probes are unchanged.
- **Code samples in docs.** The rule also respells ` ```vl ` fences and filed `Repro:` blocks.
  DECISIONS' own L2 example, `function add<U>(a: U, b: f64) { a + b }`, is a block body with a
  value tail, so it becomes `{ return a + b }`. Fences go through the same lint as a file. The
  witness check grades the rows; `vl_doc_script_paths_test` already walks every `.md`.
- **As landed**, the codemod was a whole-tree `--migrate-return` mode on a pre-fold seed. The
  fold deleted it with the flag. What stays is ordinary `vl check --fix`: the
  `discarded-tail-value` warning, the `missing-return` error, and the
  `void-callee-missing-return` caller error, whose fix edits the callee's file when that file is
  in the same run.
- **The switchover PR** (step c) applies the codemod to every tree, then lands the checker
  change, while you quiet the queue. In-flight branches re-run `vl check --fix` after merging
  master.

## Census, on master `495c1ff8`

Sites where the codemod inserts `return`: block-bodied named functions and lambdas whose last
statement is today's value return, at an annotated or inferred non-void type. Measured with a
scratch build of that rule, deduplicated by location.

| tree | sites | files with a site |
| --- | ---: | --- |
| `compiler/` | 22,830 | 260 of 262 |
| `std/` | 175 | 13 of 18 |
| `tests/cases` | 8,837 | 3,035 of 8,032 |
| `scripts/silent-sweep` (census and distilled corpus) | 3,123 | 1,817 of 11,964 |
| `scripts/capability-probes` | 614 | 373 of 1,545 |
| `scripts/` tools | 1,679 | 51 |
| `bench/` | 91 | 12 of 94 |

- **This census over-counts.** The scratch rule counted a nested tail once per enclosing
  candidate. The landed migration below is the real number.

## Migration as landed, on `lane-d-return-rule`

`return` keywords added by the flag-day diff, net of those removed, counted from
`git diff <merge-base> HEAD`. The compiler figure includes the second codemod pass that the
`emit_elab` cascade needed (4,372) and 64 hand edits. `std/embedded.ts` and
`std_embedded.rs` are regenerated, not counted.

| tree | `return`s added | files touched |
| --- | ---: | ---: |
| `compiler/` | 15,896 | 265 |
| `std/*.vl` | 131 | 14 |
| `tests/cases` | 8,819 | 3,046 |
| `scripts/silent-sweep` | 3,011 | 1,929 |
| `scripts/capability-probes` | 643 | 388 |
| other `scripts/` (tools, oracle) | 1,646 | 85 |
| `bench/` | 58 | 6 |
| docs (fences and filed `Repro:` blocks) | 2,435 | 1,619 |
| VL inside `tests/*.ts` | 569 | 43 |

- The `.ts`-embedded VL was migrated per literal: a capture of every source the tests hand the
  compiler, the codemod over each, then a mapping back to the literal. Template literals with
  `${}` mapped only where every candidate agreed. The rest was edited by hand.
- **The `std/` change is API-neutral**, since no signature changes. It needs no std review,
  only a comment-free diff.

## Rows this closes by design

- **D3477** (a nested block as a body's tail): DESIGN. The bare block is a statement.
- **D3785** (an assignment as an `f32` body's tail): its tail spelling becomes a missing
  `return`. `return x = 255` still owes the fix in `lane-d-d3785`, which covers the `return`,
  binding, argument, field and element faces. Its fixture moves to `return` spellings.
- **Rows rewritten, not closed:** D1903's `if`-arm cells keep running (rule 2), and the
  `nonvoid-bare-tail-value-*` fixtures that pin the void-context keying move to `return`.

## Open questions

None beyond A1 to A3 above.
