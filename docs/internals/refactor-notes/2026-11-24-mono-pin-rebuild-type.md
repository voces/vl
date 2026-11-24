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
| `tests/cases/generics/type-param-write-literal-union-coalesce-default.vl` | runs | runs, same output, different bytes |

- D16962's witness is `(a[0] ?? { f: 0 }).f ?? 0` in a function with an un-annotated parameter.
  The inner `??`'s paren is re-made by this pass and is now typed, so the outer `??` has a value
  form to read.
- The byte move is accepted as named. In `widened<T>`, `(s ?? "n") == "a"` with `s: K | null`:
  - before, the re-made paren carried no type, and legacy compared it as `K`'s atom index;
  - after, it carries its template type, `string`, since a `??` whose default is no member widens
    to the base (D3423), so legacy compares strings.

  The old compare was right by accident: `"n"` has no atom.

## Readings (fixpoint seeds on both sides, master 18fcee51c)

- **Identity:**
  - `ir-identity --names`: identical 9,433, differ 0; the self-compile is identical, so the
    compiler's own generic bodies do not reach these arms.
  - Mode 3: corpus and self-compile identical.
  - `--claimless`: identical 14,486, differ 0.
  - `--cases`: 8,074 identical, 1 differ (the named move); witnesses 77 same.
- **Coverage:**
  - Armed self-compile: 20,639 covered = verified = matched.
  - tests/cases functions with no blocker: 85,665 -> 85,672.
  - `rep ?`: 17 -> 13 (as the sole blocker, 15 -> 11). It falls at
    `modules/generic-ufcs-imported-self-fn/entry.vl` (`xs.sorted(lt)[0]`, now claimed with its
    bytes kept), `maps/hole-param-parenthesised-coalesce-read.vl` (+4),
    `generics/pin-non-null-dead-null-test.vl` and `generics/type-param-write-cell-reads-at-pin.vl`.
  - The corpus's 2 `rep ?` functions, the d3127 cells, are a different subclass.
- **Other gates:**
  - `mono-tyaram-grid.sh`: 252 of 261 pass, the 9 REJECT as before, no BAD cells.
  - `check-filed-witnesses --strict`: D17240 and D16962 MOVED to runs, both closed here.
  - rep-fuzz exact; regress: no runs lost; self ir misses 0.
  - L2 fuel +0.01% per PR; late demands 10 of 10, late tag rows 315 of 315.

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
