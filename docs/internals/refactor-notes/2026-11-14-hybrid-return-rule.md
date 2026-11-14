# The hybrid return rule: design note for the flag day, 2026-11-14

Lane D. Owner ruling, 2026-11-14:
1. An expression-bodied lambda `(x) => expr` keeps its expression as the value.
2. An `if` or `match` arm in value position keeps its last expression as the value.
3. A function's block body (`function f() { … }`, `(x) => { … }`) returns a value only through
   `return`. With no `return expr`, it returns nothing.

This settles `open-rulings.md` §`bare-block-as-expression`: a trailing bare block is a statement.
D3477 closes as DESIGN. Nothing is built yet; this note comes before code.

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
- **An un-annotated block body whose discarded tail is a pure value** (a name, literal,
  operator, field read or record), so the author almost certainly meant it as the result.
  Warning `discarded-tail-value`, with the same `--fix`. A tail call stays silent: a void
  callback ending in `xs.pop()` is the case the 2026-08-31 rule was written for.
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

- **Filed `Repro:` blocks** in `docs/internals/inventory*` are not counted yet. The codemod has
  to rewrite them too, and `check-filed-witnesses` will grade them.
- **The `std/` change is API-neutral**, since no signature changes. It needs no std review,
  only a comment-free diff.

## Rows this closes by design

- **D3477** (a nested block as a body's tail): DESIGN. The bare block is a statement.
- **D3785** (an assignment as an `f32` body's tail): its tail spelling becomes a missing
  `return`. `return x = 255` still owes the fix in `lane-d-d3785`, which covers the `return`,
  binding, argument, field and element faces. Its fixture moves to `return` spellings.
- **Rows rewritten, not closed:** D1903's `if`-arm cells keep running (rule 2), and the
  `nonvoid-bare-tail-value-*` fixtures that pin the void-context keying move to `return`.

## Questions before code

1. **The object-literal body** `function makePoint() { x: 3 }`. The parser reads it as an
   expression body (`looksLikeObject`). Keep it as rule 1, or make braces after `function`
   always a block, so the record is `return { x: 3 }`? The second makes `{` unambiguous;
   proposal: braces are a block.
2. **The warning for a discarded pure tail** in an un-annotated block body: warning, or error?
   Proposal: warning, with `--fix`.
3. **Lambdas checked against a non-void expected type** (`xs.map((x) => { x + 1 })`) become
   type errors ("got void"). The codemod inserts the `return`. The new diagnostic names the
   lambda's tail. Confirm that is the intended outcome, with no contextual exception.
