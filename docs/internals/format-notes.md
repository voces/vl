# Formatter notes

Long-form rationale and measurements moved out of `compiler/format.vl` by the
2026-09-02 comment trim (the comment-block budget: 12 lines a block, 40 a module
header — `compiler/lint.vl`'s `comment-block-too-long`). Each section is the
block's text as it stood in the file; the code keeps the invariant, the WHY, and
a pointer here. Nothing in this file is graded by a gate — a claim that needs
grading belongs in `silent-class-inventory.md` as a row with a repro.

**Two references in the archived text below are STALE, and are kept only because
the move is verbatim.** `compiler/format.ts` was deleted in #458 ("kill-TS: retire
the orphaned TS formatter"), so "the VL port of `compiler/format.ts`" and "like the
host" name a file that no longer exists; `scripts/vl-compiler-driver.vl` is likewise
gone, and `docs/vl-tech-debt.md` is now `docs/internals/vl-tech-debt.md`. The
trimmed comments in `compiler/format.vl` do not repeat them.

## Module header — coverage, surface-form recovery, residual divergences

Moved from `compiler/format.vl` (the 57-line block at line 4, as it stood at 2026-09-02).

```text
AST-driven source formatter for the self-hosted VL front end — the VL port of
`compiler/format.ts` (kill-TS step 1).

`formatProgram(progRoot)` walks the parser arena (`P.nodes`) and *generates*
canonical VL source from it. Like the host it is a HYBRID:
  - EXPRESSIONS are printed structurally (operator spacing, list reflow), with
    TYPE syntax (variable / parameter / return annotations, `is` check-types,
    `type`/union declarations) recovered VERBATIM from source via per-node
    `[start, stop)` spans (`pos` .. `nodeEndOf`), since the AST stores types as
    synthetic NAME strings only.
  - CONTROL FLOW / BLOCKS / statement sequencing are pretty-printed, placing
    comments (own-line vs trailing) around them, mirroring the host's `Printer`.

SOURCE + COMMENTS are supplied by the driver through module globals before the
call: `fmtSetSource(src)` and `fmtAddComment(...)` (the lexer's retained
comments). A driver (`scripts/vl-compiler-driver.vl`) lexes → parses → calls
`formatProgram`, then the host reads the result string char-by-char.

── WIDTHS ARE CODE POINTS, OFFSETS ARE BYTES ────────────────────────────────
Every number in this file that is compared against `fmtWidth`, or added to
something that will be (a `column`), is a WIDTH and is spelled `dispWidth(s)`
(`fmt_util.vl`, which carries the argument). Every number that indexes or
slices a string is an OFFSET and stays `s.length` / `s[i]`. Stage 2c split the
two — `.length` is a byte count now — and `.length` left in a width position
wraps any line holding a non-ASCII character early, silently: a 60-column line
of em dashes measures 132 and breaks into three. An emptiness test (`s.length
== 0`) and an ARRAY length are neither, and are left alone.

── COVERAGE (what this port DOES and DOES NOT yet cover) ────────────────────
Covered: top-level + nested let/const (with `export` recovered by token scan),
function declarations (block + single-expression bodies), `type` struct decls
and union decls (verbatim), if / else if / else (with one-line collapse of a
single plain `if`), while, for-range, for-in, break/continue/return, blocks,
and the full expression grammar (names, literals, unary, binary chains with
precedence-minimal parens, `is`, member / optional / index access, calls,
object / array literals, parenthesised expressions, function expressions,
`if`-expressions), with own-line and trailing comment placement, blank-line
preservation, list reflow at the width, the multi-line trailing-comma policy,
and fit-or-break layout of member/call CHAINS (two links or more — see the
"member / call CHAIN layout" section for the threshold and why the fit is
measured flat).

SURFACE-FORM RECOVERY: the self-host parser DESUGARS several constructs in the
arena. Most carry a faithful-surface MARKER on the node so the printer reprints
the written form directly: compound assignment and prefix increment (`a += b` /
`++x`, via `binCompound`), the negated guard (`x !is T`, via `IsExpr.isNeg`);
postfix `x++` rides a `Unary "p+"`. `else if` is the one chain form (no fused
`elseif` keyword). The remaining token-scanned forms are quoted operator /
index-trap object keys (`"[]"`, `"*"` — the parser strips the quotes), the
`export` modifier, and `import` statements (which the parser consumes without a
node) re-emitted from the token stream. The self-host KEEPS explicit `Paren`
nodes, so a paren round-trips as written.

RESIDUAL host divergences (semantics-preserving, so they still satisfy the
idempotent / AST-round-trip / comment guarantees): object-literal method
shorthand `m(a) { … }` is expanded to `m: function(a) { … }`, and short
`else if` chains are not collapsed onto one line. See docs/vl-tech-debt.md.
```

## alignComments — the whole-text trailing-comment pass

Moved from `compiler/format.vl` (the 15-line block at line 266, as it stood at 2026-09-02).

```text
── trailing-comment alignment (a whole-text post-pass) ───────────────────────
`vl fmt` normalizes the spacing before a trailing `//`/`///` comment to a
SINGLE space per line; this pass re-aligns runs of them to a common column so
hand-aligned comment groups survive a format. It runs over the FINISHED text
so it treats EVERY trailing comment uniformly — both the ones the printer
emits (`trailerSuffix`) and the ones reproduced verbatim inside a `type`/union
slice — without the printer having to special-case any node.

A BLOCK is a maximal run of lines that are neither blank nor an own-line
comment; a comment-LESS code line inside it is tolerated (it neither breaks
the block nor pulls the column). Within a block, every trailing comment aligns
to `max(code width of the commented lines that still leave room before the
width) + 1`. A commented line whose code is already too wide keeps its single
space and does NOT drag the column out. The column is recomputed identically
on a re-run, so the pass is idempotent.
```

## imports and body-scoped `type`s are filtered from the statement walk

Moved from `compiler/format.vl` (the 13-line block at line 549, as it stood at 2026-09-02).

```text
Imports are emitted from the TOKEN stream (verbatim slice / reflow — the
strategy that keeps comment-bearing imports byte-exact), so the parser's
`ImportDecl` nodes are FILTERED out of the statement walk: emitting them
there too would duplicate every import. Seed the top-level blank-line
policy with the last import's line.

D1045 — A BODY-SCOPED `type` IS FILTERED FOR THE SAME REASON, one scope in.
The parser hoists such a declaration into `progStmts` so the checker and the
emitter register it (they read that list and only that list), and it stays at
its lexical position inside the block as well — so the walk reaches it TWICE
and printed it a second time at the end of the file. Measured, not reasoned:
`vl fmt` on `scripts/capability-probes/body-scope-type-decl.vl` appended a
stray `type P = { x: i32, y: i32 }` after the last statement.
```

## wrapTypeDecl — isRecord is the parser's verdict, not the text's

Moved from `compiler/format.vl` (the 24-line block at line 1016, as it stood at 2026-09-02).

```text
Wrap an over-width single-line type decl `codeLine` (already carrying its
`export ` prefix) across lines, emitting at `indent`; `suffix` (a trailing
comment) goes on the final line. Returns `true` when it wrapped, `false` when
the decl is not a shape we know how to wrap (a non-union alias) — the caller
then falls back to the verbatim path. A UNION (`type N = A | B | …`) keeps its
first member on the `=` line and gives each remaining member its own `| …` line
(the form the parser accepts — a NEWLINE right after `=` does not parse). A
struct RECORD (`type N = { a: T, … }`) opens the brace, one field per line with
a trailing comma, then a closing `}`.

`isRecord` is the PARSER's own verdict, threaded down from the `n is TypeDecl` /
`n is UnionDecl` test at the statement dispatch — not re-derived here from the
rendered spelling. `parseTypeDecl` emits a `TypeDecl` for exactly one RHS shape,
a `{ … }` with NO `&`/`|` continuation, and a `UnionDecl` for every other,
INCLUDING `{ … } & { … }` and `{ … } | { … }`, which it re-encodes as a union
over synthetic member names. Asking the text instead (`body[0] == '{'`) called
both of those re-encoded shapes a record and peeled `body.slice(1, len - 1)` off
a body whose first `}` is not its last, producing a decl that does not re-parse:
`vl fmt` failed with "formatter produced invalid output — file left unchanged,
please report" (rc 3) on valid source. The wrapped shapes it now emits are pinned
by `tests/cases/parser/type-decl-brace-{union,intersection}-multiline.vl`, which
are the PARSER half; the fmt half has no corpus pin because `tests/` is excluded
from the `vl fmt --check` gate by construction (see the D-FMTDECL hand-off).
The parser has already decided this; the spelling is not asked a second time.
```

## emitIfChain — the canonical multi-conditional layout

Moved from `compiler/format.vl` (the 14-line block at line 1324, as it stood at 2026-09-02).

```text
Render an `if … else if … [else]` chain whose every branch is a brace block, in
the canonical multi-conditional layout:
  if cond {
    …
  } else if cond {
    …
  } else {
    …
  }
A chain is a nested `IfStmt` in the `ifElse` slot (`else if` — there is no fused
`elseif` keyword), detected by `elseIsIf`. Returns false when the node is not
such a chain (no nested-if else, or some branch is not a brace block) — the
caller then uses the plain `if`/`else` forms. Every chain keeps this stable
multi-line block form (no one-line collapse).
```

## asExpr — the suffix is part of the operator

Moved from `compiler/format.vl` (the 17-line block at line 1925, as it stood at 2026-09-02).

```text
`x as T` — the target is stored canonically on the node (`asTy`), so it needs
no source recovery (unlike `is`). The operand renders through `primary`, which
parenthesizes a composite (`(a + b) as f64`) so the cast keeps binding the whole
value; a chained `x as i32 as i64` stays flat (an `AsExpr` operand is not
composite), which round-trips idempotently.

THE SUFFIX IS PART OF THE OPERATOR, AND DROPPING IT CHANGED THE PROGRAM. This printed
a bare `" as "` for every member of the family, so `vl fmt` silently rewrote
`x as! T` and `x as? T` to `x as T` — turning a TRAP into a propagation, or a coalesce
into one, with no diagnostic. That is the one thing a formatter may never do, and it was
reachable on any file using the error-handling trio at all: the three differ only in
this token (`error-handling-design.md` §Trio — `as` propagates, `as?` coalesces to null,
`as!` traps, `as%` wraps). `as%` is the fourth suffix and carries the same risk: dropping
its `%` turns a wrap into an exact-or-fail propagation.

The mode rides the node (`asMode`, set by the parser from the token it consumed), so
like `asTy` it needs no source recovery — the bug was simply never asking. Pinned by
`tests/vl_fmt_test.ts`, which round-trips all four beside a `%` remainder.
```

## member / call CHAIN layout — the threshold and the flat fit

Moved from `compiler/format.vl` (the 36-line block at line 1972, as it stood at 2026-09-02).

```text
── member / call CHAIN layout (fit-or-break) ─────────────────────────────────

A postfix chain of TWO OR MORE `.name` / `?.name` links is laid out fit-or-
break — the same policy `wrapList` gives an argument list, measured against the
same `fmtWidth`. Inline while the chain fits from its start column; otherwise
ONE LINK PER LINE at `indent + 1`, starting from the FIRST link:

  expect(build(cfg))
    .toEqual(want)

The broken form is only printable because a leading `.` / `?.` on a new line
CONTINUES the chain (DECISIONS.md, owner 2026-09-02); before that ruling the
formatter had no choice but to re-join one, which is what made the spelling
unusable in a `fmt --check`ed tree.

THE THRESHOLD IS TWO LINKS, and a LINK STARTS AT THE FIRST CALLED STEP. It is
a threshold on structure, not on width. `(args)` and `[i]` suffixes RIDE the
step they follow, and every `.field` step BEFORE the first step that carries a
call belongs to the chain's HEAD — so

  P.toks.push({ … })          head `P.toks`, ONE link — never breaks
  node.callArgNames.length    head, no link at all — never breaks
  xs.filter(f).map(g).length  head `xs`, THREE links — breaks when wide

That merge is what keeps the rule off the dominant shape in this tree. Without
it a plain field path whose only call takes a long object literal breaks into
`P` / `.toks` / `.push({ … })`, which is worse at every width: the overflow
lives in the ARGUMENT, and `wrapList` already had the right answer for it.

AND THE FIT IS MEASURED FLAT. The width policy being decided here is the
CHAIN's, so the measurement forbids the interior lists to wrap first —
otherwise a long final argument list absorbs every overflow (`wrapList` runs
before the chain is ever consulted) and no chain is ever wide enough to break.
A flat form that fits is what the ordinary path would have produced anyway, so
a fitting chain prints byte-for-byte as it did before this rule existed, and
costs one render.
```

## the trailing-lambda exception

Moved from `compiler/format.vl` (the 16-line block at line 2249, as it stood at 2026-09-02).

```text
── the trailing-lambda exception ─────────────────────────────────────────────

The generic list rule is "an argument spans lines ⇒ break EVERY argument",
which is right for every multi-line argument but one: a BLOCK-bodied lambda in
FINAL position already carries its own vertical structure in its braces, so
breaking the list around it adds four lines and a level of indent to say
nothing, at ANY width — `it("adds", () => { … })` became a six-line vertical
list in a 34-column call. Every JS formatter carves this exception; the three
rulings behind ours (LAST argument only / two lambdas ⇒ no hug / a lambda
followed by another argument ⇒ not trailing ⇒ no hug) and the corpus
measurement behind each live in `docs/internals/fmt-trailing-lambda-design.md`.

The guards below are what make those three rulings ONE rule: an EARLIER lambda
renders multi-line, so it fails "every preceding argument fits on one line"
and the whole call breaks; a lambda that is not last fails "the last argument
is a block lambda". Neither needs a rule of its own.
```
