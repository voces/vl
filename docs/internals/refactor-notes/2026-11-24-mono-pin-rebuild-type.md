# Mono: a node the pin pass re-makes answers its template's type (D17240), 2026-11-24

Lane IR-N6, the queue's express: `rep ?` (B) at the cause, before the IR-side rule. In a generic body,
`monoPinBinOps` (`emit_mono.vl`) is the pin pass that runs per instance. It lowers a member call such
as `xs.rev()` to a direct call. That changes a kid of the call's parent, so the pass re-makes the
parent (`Index`, `Paren`, `Member`, `Unary` and its other rebuild arms) with a bare `mk…`, which
records no type. Legacy read such an index at `i32`: right for an `i32`, string, boolean or record
element, and an invalid module at `f64` or `i64` (D17240). The IR missed the node as `rep ?`.

## The mechanism

- `monoPinBinOps` becomes a wrapper over the walk, now `monoPinBinOpsRaw`, with the same shape
  `monoCloneGenericCalls` already has.
  - A re-made node with no type of its own records its template's type through this instance's
    pin (`monoPinnedTyOf`).
  - It writes nothing when the template had no type.
  - It never touches a node that has a type already, since `nodeTyIxOf(nx) < 0` gates it.
- No arm changes. The IR needs no change: `own` is now the node's type, so the `rep ?` miss is
  gone.
- `scripts/pin-helper-budget-baseline.json` goes from 905 to 906 for `emit_mono.vl`. The added
  function is `monoPinBinOpsRaw`, the wrapper's walk (the queue's ruling).

## The IR's atom compare reads through parens

The newly typed paren surfaced one IR split. In `type-param-write-literal-union-coalesce-default.vl`'s
`widened<T>`, consider `(s ?? "n") == "a"` with `s: K | null`.
- Legacy's `atomEqPlanOf` asks `exprIsLitAtom` (`emit_classify.vl`). That unwraps the paren and asks
  the inner `??`, whose join is `K`'s atom, so legacy writes the atom compare.
- The IR's `atomOperand` and `atomSide` (`ir_build.vl`) read the paren itself. Untyped before this
  change, it fell through to legacy's reading. Now typed `string`, it built a string compare: an
  armed mismatch (`prefix or locals at 0x4a vs 0x78`), which the shipped build carried as a
  `--cases` differ.

Both helpers now unwrap the paren with the same `unwrapParen` (which strips nested parens), so
`widened<T>` matches 5 of 5 again. `scripts/capability-probes/matrix/paren-coalesce-atom-compare.matrix.vl`
sweeps the spellings, each in a generic body and a plain function:
- `(s ?? "n") == "a"`, `"a" == (s ?? "b")`, `(s ?? "b") != "a"`, `((s ?? "n")) == "a"`;
- a paren over a non-atom `??`, `(t ?? "x") == "a"` with `t: string | null`, which stays the string compare.

66 of 66 graded cells RUN. Armed, it matches 112 of 116, the same count as master; the 4 left over
are the literal-left spelling `"a" == (s ?? "b")` (`unlowered: operand above a valued if's value`),
identical on master's seed.

## Legacy tails the IR calls

None new.

## Nodes the wrapper types

Counted with a scratch counter compiler, built from an archive copy of this tree:

| population | programs | nodes newly typed |
| --- | ---: | ---: |
| tests/cases | 83 | 165 |
| distilled corpus | 172 | 173 |
| self-compile | 0 | 0 |

Most corpus nodes are the d511 and d532 objop `_typar` grids, all byte-identical.

## Legacy moved

| program | before | after |
| --- | --- | --- |
| D17240's witness and its paren and variable-index spellings, at `f64` and `i64` | invalid module | runs |
| D16962's witness, filed by lane F2 | loud emit reject | runs, prints `4` |

- D16962's witness is `(a[0] ?? { f: 0 }).f ?? 0` in a function with an un-annotated parameter.
  The inner `??`'s paren is re-made by this pass and is now typed, so the outer `??` has a value
  form to read.
- No other program moves: `--cases` differs 0, and the tests/cases A/B's one differ is
  `tests/cases/generics/member-call-index-in-generic-body-at-each-element.vl`, this change's own
  witness (invalid module on the base, runs on the candidate).

## Readings (fixpoint seeds on both sides, master 13753236b)

- **Identity:**
  - `ir-identity --names`: identical 9,433, differ 0; the self-compile is identical, so the
    compiler's own generic bodies do not reach these arms.
  - Mode 3: corpus and self-compile identical.
  - `--claimless`: identical 14,501, differ 0.
  - `--cases`: 8,093 identical, 0 differ; witnesses 79 same.
- **Coverage:**
  - Armed self-compile: 20,650 covered = verified = matched.
  - Armed tests/cases: 11 mismatches on each seed.
  - tests/cases functions with no blocker: 85,921 -> 85,936.
  - The programs that gain a function:
    - `generics/member-call-index-in-generic-body-at-each-element.vl` (+8, the new witness);
    - `maps/hole-param-parenthesised-coalesce-read.vl` (+4);
    - `generics/pin-non-null-dead-null-test.vl`;
    - `generics/type-param-write-cell-reads-at-pin.vl`;
    - `modules/generic-ufcs-imported-self-fn/entry.vl` (`xs.sorted(lt)[0]`, claimed with its bytes kept).
  - No program loses a function.
  - `rep ?`: 17 -> 13 in tests/cases. The corpus's 2, the d3127 cells, are a different subclass.
- **Other gates:**
  - `mono-tyaram-grid.sh`: 252 of 261 pass, the 9 REJECT as before, no BAD cells.
  - `check-filed-witnesses --strict`: 5,677 graded, 0 MOVED, with D17240 and D16962 filed closed.
  - rep-fuzz exact; regress: no runs lost; self ir misses 0.
  - L2 fuel +0.00% per PR; late demands 10 of 10, late tag rows 315 of 315.
  - `scripts/gate.sh --fast` passes, `ir shadow cases` among its rows.

## Position sweep

`scripts/capability-probes/matrix/generic-member-call-index.matrix.vl` has these cells:
- `xs.rev()[0]` in a generic body at `i32`, `i64`, `f64`, string, boolean, record, list and closure
  elements, each at return, `let` and argument, and scalars also at `print`;
- `(xs.rev())[0]` at `f64`, `xs.rev()[i]` at `i64`, `xs.rev().length`;
- `first<f64>` and `first<i64>` in one program;
- D16962's witness.

114 of 114 graded cells RUN after, and runs -> not-runs is 0. 24 cells go from not-runs to RUNS: the
22 invalid `f64`/`i64` cells, plus D16962's refusal in both faces.

Legacy lines deleted: 0. Moved to `@ir`: 0.
