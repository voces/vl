# The `vl fmt` trailing-lambda exception

`docs/internals/vl-test-design.md` §"Known gaps" item 0 filed the defect: `vl fmt`
explodes a call with a BLOCK-bodied lambda argument into a vertical argument list
**structurally, not on width** — a 34-column `it("adds", () => { … })` breaks into six
lines exactly as a 100-column one does, because the list rule is *"an argument spans
lines ⇒ break every argument"* and a block-bodied lambda always spans lines.

```
it("adds", () => {              it(
  expect(1 + 1).toEqual(2)        "adds",
})                        →       () => {
                                    expect(1 + 1).toEqual(2)
                                  },
                                )
```

The filing deliberately deferred three design questions rather than lock in a bad rule
inside a runner PR. This document answers each with a **ruling**, the alternative it
beat, and the measurement or convention behind it. It also records the scope the rule
does NOT claim (§4) and the two sabotages that pin it (§5).

**Where it lives:** `compiler/format.vl`, `callExpr` + `hugTrailingLambda`
(~55 lines, no other file). Pinned by four fixtures in `tests/vl_fmt_test.ts` —
NOT `tests/cases`, which the fmt gate never sees.

---

## 0. The rule, as shipped

> When the **final** argument of a call is a **block-bodied** lambda, and every
> preceding argument renders on one line, and the resulting head line fits `fmtWidth`
> — keep the call head and the earlier arguments on one line and hug the lambda.
> Otherwise the call takes the vertical form it takes today.

```vl
it("adds", () => {
  expect(1 + 1).toEqual(2)
})
```

Three guards, and — this is the point — **the three rulings below are not three rules.**
They are what those guards already say:

| ruling | the guard that produces it |
| --- | --- |
| only the LAST argument hugs | "the last argument is a block lambda" |
| two lambdas ⇒ no hug | an earlier lambda renders multi-line ⇒ "every preceding argument fits on one line" fails |
| a lambda followed by another argument ⇒ no hug | the last argument is not a lambda |

No ruling below costs a line of code of its own. That is the strongest evidence that
the guard set is the right one, and it is why the rulings are worth stating: each is a
claim about what the guards must *keep* meaning.

### The corpus census behind every ruling

Structural, not name-based: a comment/string-aware scan that bracket-matches every
call in the repo and classifies each argument that is a block-bodied arrow lambda by
its **position** (`scripts` reproduction in §6).

| | calls with ≥1 block-lambda argument | lambda is LAST (and the only one) | a block lambda NOT last | ≥2 block lambdas |
| --- | --- | --- | --- | --- |
| `compiler/` + `std/` + `scripts/` (the fmt gate, 33 files) | **0** | 0 | 0 | 0 |
| `tests/` (1,701 `.vl` files) | **38** | **36** | **2** | **0** |

The gated tree's zero is not an accident of style — it is the defect: the formatter
already exploded every one, so no such call **can** exist in a fmt-clean tree.

---

## 1. RULING — only the LAST argument hugs

**RULING: hug the final argument only. An earlier lambda argument never hugs.**

*Convention.* This is Prettier's rule (`shouldGroupLast` in `print-call-arguments`):
the last argument is the one that may "expand" out of the argument group; the
preceding arguments must contain no function for it to apply.

*Measurement.* Every one of the **36** hug-eligible sites in this repo has the lambda
last — `it(name, fn)`, `describe(name, fn)`, `beforeEach(fn)`, `xs.each(f)`. The two
sites with a block lambda *not* last are both `callIt((v) => { … }, k)`
(`tests/cases/closures/closure-litunion-param-valuecall.vl:109`,
`closure-value-union-param-valuecall.vl:165`) and both are **already written in the
vertical form** — the corpus spells the ruling before the formatter enforces it.

### Alternatives

- **Also hug a leading lambda (Prettier's `shouldGroupFirst` — the `useEffect(() => { … }, [deps])`
  shape).** A genuine contender: the two non-last sites above are *exactly* that shape.
  Rejected on cost/benefit. Prettier's first-argument rule is not "hug the first
  lambda"; it is a **second heuristic** — the call must have exactly two arguments, the
  first a function, the second neither a function nor a "concise" object/array — and
  heuristics of that shape are where formatters become unpredictable. Two sites in
  1,701 files is not a forcing customer. **Re-open condition:** it is purely additive.
  A call the trailing rule declines is spelled vertically, and vertical is what those
  two sites already spell, so adopting `shouldGroupFirst` later un-does nothing.
- **Hug any single block lambda wherever it sits.** Rejected: it produces the
  measured seam in §2 whenever a non-last lambda is followed by arguments, since a
  hug can only re-indent the head line, not an argument already rendered below it.

---

## 2. RULING — two lambdas break the call

**RULING: a call with two or more block-bodied lambda arguments takes the vertical
form. Neither one hugs.**

*Convention.* Prettier's again: `shouldGroupLast` is refused when any earlier argument
"will break", and a function argument always will.

*Measurement — the census.* **Zero** calls in this repo pass two block lambdas. The
ruling costs nothing today; it is a claim about what happens the first time someone
writes one.

*Measurement — what the alternative actually emits.* The alternative ("hug the last
one anyway") was not argued about, it was **built**: the compiler was rebuilt with the
`hasNewline(pre[j])` guard deleted, and `two(() => {…}, () => {…})` came out

```
two(() => {
    print(1)
  }, () => {
  print(2)
})
```

The two bodies sit at **different depths** (4 and 2) and the closing brace of the first
lambda lands mid-line. This is not a tuning problem: the earlier lambda was rendered as
a list item at the continuation depth *before* the hug decision could exist, and a
string-concatenating printer cannot re-indent it afterwards. The vertical form is the
only one that keeps the two bodies at the same depth.

### Alternatives

- **Hug the last, break the first** (`two(\n  () => { … },\n() => {\n … })`) — the
  seam above, with the same depth mismatch and no reader benefit.
- **Hug both.** Would need the argument list to be re-rendered at a depth chosen after
  the fact — a doc-IR printer (Prettier's `group`/`indent`) can do this; this formatter
  emits strings and cannot. Out of proportion to a shape with zero occurrences.

---

## 3. RULING — a lambda followed by another argument is not trailing

**RULING: if the last argument is not a block lambda, nothing hugs — including when an
earlier argument is one.**

*Convention.* It is the definition of "trailing"; Prettier agrees except through the
narrow `shouldGroupFirst` door §1 declines.

*Measurement.* The two occurrences in the repo are the `callIt(lambda, k)` sites named
in §1, both already vertical, both **unchanged** by this PR — verified by the
corpus A/B in §6, where they are not among the four files whose formatting moved.

### Alternatives

- See §1's `shouldGroupFirst` entry — this ruling and that one are the same question
  asked from the other end, and they were decided together.

---

## 4. Scope the rule does NOT claim

- **Expression-bodied lambdas are untouched.** `xs.map((v) => v + 1)` renders on one
  line today and is not a hug candidate — it never spanned lines, so the list rule
  never fired on it. Pinned by fixture A.
- **The head must fit.** If the hugged head line would exceed `fmtWidth` the hug is
  declined and the call breaks vertically, so the rule can never *create* an
  over-width line. Pinned by fixture C.
- **Object- and array-literal elements do not hug.** `{ f: () => { … } }` and
  `[() => { … }]` keep the one-item-per-line form. No occurrences ask otherwise, and
  the JS convention is the same.
- **A hugged call inside a `+`-chain or an `if` condition inherits a PRE-EXISTING
  continuation-indent wart** — the second operand's body is under-indented. Measured
  identical in kind on master (the vertical form mis-indents there too), so it is not
  a regression of this rule; it belongs to `binaryChain`'s continuation depth and is
  filed with the rest of `docs/vl-tech-debt.md`'s printer divergences.
- **ONE-RENDER discipline (implementation, load-bearing).** `functionExpr` renders a
  lambda body through `cmtCursor`, the formatter's **consuming** comment cursor. A hug
  that rendered the body speculatively and then fell back would **delete every comment
  inside it at rc 0**. `hugTrailingLambda` therefore decides *before* it renders — the
  decision needs only the lambda's header, which is recovered from source spans and is
  side-effect free — so a declined hug never touches the cursor. Pinned by fixture C.

---

## 5. Sabotages

Both were built (compiler rebuilt, suite re-run), not reasoned about.

| sabotage | edit | witness |
| --- | --- | --- |
| **hug-nothing** | `isBlockLambda` forced to `false` | fixtures **A**, **C**, **D** red; B stays green (it asserts the vertical form, which hug-nothing also produces) — 31 passed / 3 failed |
| **hug-everything** | the `hasNewline(pre[j])` guard deleted | fixture **B** red (the `}, () => {` seam of §2) — 33 passed / 1 failed |

The pair matters: hug-nothing alone would pass a formatter that hugs indiscriminately,
and hug-everything alone would pass one that never hugs. Each names the other's blind
spot.

---

## 6. Measurements (how to re-run each headline)

All against a compiler built from this branch, versus one built from master
(`bash scripts/fetch-seed.sh` into a scratch path gives the master compiler, since
master is its own fixpoint).

| claim | probe |
| --- | --- |
| **blast radius = 0** | `find compiler std scripts -name '*.vl' \| xargs -n1 vl fmt --check` → 33 files, 0 drift. No gated file is reformatted by this PR. |
| the vl-test fixtures are now fmt-clean **as written** | `vl fmt --check tests/fixtures/vl-test*/*.test.vl` → 8/8 rc 0. The "deliberately not fmt-normalized" comments were therefore replaced. |
| corpus effect | format all 1,693 `tests/cases/**/*.vl` with both compilers and `cmp` → **4** files differ, all `tests/cases/closures/` (three `…-arena-walk.vl`, one `contextual-reflist-param.vl`), each collapsing a 7-line vertical `apply(…)` into a 5-line hug. |
| **idempotence** | `fmt(fmt(x)) == fmt(x)` over every parseable corpus file → 1,675 checked (26 deliberately-unparseable skipped), **0** failures. |
| **round-trip / parse safety** | for every corpus file: `vl build` the original AND the formatted text, `cmp` the wasm → 1,693 files, **0** differences (26 non-building, identical rc both ways). |
| the formatter's reject set is unchanged | the set of files `vl fmt` refuses is byte-identical between master and this branch (26 = 26). |
| the census | a comment/string-aware bracket-matching scan classifying every block-lambda argument by position; the table in §0. |
