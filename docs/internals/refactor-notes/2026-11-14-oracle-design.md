# An independent oracle: design and first results (2026-11-14)

Engineering review 2026-11 §6 item L6. A deliberately simple definitional interpreter for VL
walks the program with plain dynamic values, and its output is compared with the compiled
program's. Any difference is a bug in the compiler, in the oracle, or in the spec. A run-time
type check at every typed delivery also catches a program the checker accepted unsoundly.
The precedents are cranelift-interpreter with cranelift-fuzzgen, the Wasm spec interpreter
in wasmtime's differential fuzzing, and Miri.

**Headline.** The prototype runs **96.0% of the distilled corpus (11,449 of 11,929 cells)**
and **4,000 of 4,000 rep-fuzz programs**. It found **four compiler bugs**. Three are filed as
[D16370](../inventory/D16370.md), [D16371](../inventory/D16371.md) and
[D16373](../inventory/D16373.md). The fourth, a postfix `x++` value on an i64 binding, is the
bug lane I's #8094 fixes, independently found there. Each has a witness of three lines or
fewer, and D16373's is `const y: i64 = if c { 7 } else { 9 }`. Every other
disagreement was the oracle's own bug, now fixed, or a spec gap, listed in (c) as an owner
question.

## (a) Implementation language: TypeScript on Deno

* **Independent of the compiler under test.** An oracle written in VL would be compiled by the
  compiler it judges, so a miscompile could hit both sides the same way. Rust would add a
  second crate beside `scripts/vl-host` for no gain. TypeScript shares no code and no runtime
  with the emitter, the checker or the seed.
* **Dynamic values cost nothing to write.** An i32 is a JS number kept to 32 bits with `| 0`
  and `Math.imul`. An i64 is a `bigint` wrapped with `BigInt.asIntN(64, …)`. An f64 is a
  number, an f32 is `Math.fround`, and a constant is an exact `bigint`, or an exact rational
  for a float constant, rounded once at its use (E9.1). JS `Number#toString` is the shortest
  round-trip rendering both hosts print (DECISIONS §print renders host-side).
* **Its own parser.** The oracle's lexer and parser (`syntax.ts`) are written from
  `docs/spec/`, not from `compiler/parser.vl`. Reusing the compiler's parser would have been
  acceptable, but it is reachable only through the seed, and a parser of its own is about
  700 lines.
* **Deno is already in every gate**, and the repository carries no Python.

**How it stays alive.** The old `reference/ts-interpreter` rotted because nothing ran it, and
it was deleted in #8044 when its imports no longer resolved. This oracle is run from day one in
three places:

1. `tests/oracle_smoke_test.ts`, in `deno task test`, takes about 40 ms. It runs every
   ```` ```vl ```` example in `docs/spec/*.md` that says what it prints and refuses nothing.
   That is **136 of 154 examples**; the other 18 are listed in `scripts/oracle/spec-skips.json`.
   The test fails when one of the 136 disagrees, and also when a listed skip starts to pass,
   so the list can only shrink. A spec edit the oracle has not learned breaks this test, so
   the oracle cannot drift from the spec without someone noticing.
2. The `sweep`-labelled CI run, described in (d).
3. A `scripts/fuzz-sweep.sh` leg, also in (d).

## (b) The first subset, measured

The subset is what the two populations use: what `scripts/fuzzgen.vl` emits (records, lists,
maps, nullable fields, unions read through `is`, closures, literal unions, the four
positions), and what the distilled corpus uses most (`Map()`, `??`, `is`, type aliases and
generics, UFCS `x.f()`, `for` loops, operator functions `function "+"`, std `reverse`,
`concat`, `insert`, `indexOf` and `filled`, and `toString`). Generics are erased: a type
parameter conforms to anything.

| population | programs | in the subset | out of it, top reasons |
| --- | --- | --- | --- |
| distilled `cells/` + `named/` | 11,929 | **11,449 (96.0%)** | operator-function spellings `function <`, `function -` without quotes (≈300, all check rejects), intersection types (23), `list.get` (22), string `cpAt`/`charCodeAt`/`isCharBoundary`/`indexOf` (80) |
| `fuzzgen.vl` (branching + multiobs), 8 seeds | 4,000 | **4,000 (100%)** | — |
| `scripts/oracle/gen.ts` arithmetic, 8 seeds | 2,000 | **1,340 (67%)** | a radix constant under a bitwise operator before its width is known (187), `/` or `%` on one (47), a radix constant in a float context (17); see (c) |
| spec examples | 154 | 136 (88%) | labelled blocks, `break` with a value, block comments, `popcnt`, `u8[]` stores |

`scripts/oracle/gen.ts` is new. It generates well-typed programs on the axis `fuzzgen.vl`
deliberately leaves out ("arithmetic is deliberately NOT fuzzed here … VL can't evaluate
independently"): mixed widths, casts, constant trees, shifts, `min`/`max`, compound
assignment, `++`/`--`, and evaluation order through printing calls. It is the oracle that
makes that axis testable. The three invalid-wasm bugs were all found there.

## (c) The semantics questions it forced

Each row below says where the oracle takes its answer from. All of them match the compiler
today, except those marked as bugs.

| question | answer | source |
| --- | --- | --- |
| integer overflow | wraps; `MIN / -1` and division by zero trap | E2.3, T1.2; DECISIONS §"Integer overflow wraps by default" |
| `/` and `%` | `/` truncates toward zero, `%` takes the dividend's sign; float `%` is fmod | E2.3, E2.5 |
| shift counts | masked to the width at run time, a constant count `< width` | E6.2 |
| numeric widening | i32→i64, i32→f64, f32→f64 at deliveries and in mixed arithmetic; nothing else | E2.2, T2.6 |
| constant arithmetic | exact, one rounding at the use; `0.1 + 0.2` prints `0.3` | E9.1; DECISIONS §"Exact constant arithmetic" |
| a constant's type | from its context, else the T2.1/T2.2 default; a cast's target is a context | T2.1–T2.4 |
| a constant tree at an i64 destination | the tree computes at 64 bits and its i32 peer widens | DECISIONS D3043 (§"A negation chain … is a literal tree") |
| radix literals | a bit pattern at the use's width; a pattern over 32 bits is i64 | T2.3, E9.1 |
| a constant at a one-member join | adapts to the other side, or the join widens | T3.6 |
| evaluation order | source order for operands, arguments, elements and fields | E10.1 (D1510) |
| `&&` and `||` | short-circuit; no truthiness | E4.1, E4.2 |
| a compound assignment's target | its object and index are evaluated once | E7.2 |
| string comparison and length | compare by code point; `length` and `s[i]` count UTF-8 bytes | E3.3; `print("é".length)` prints 2 |
| float printing and equality | shortest round-trip, `Infinity`, `NaN`, `0` for both zeros; NaN ≠ NaN | DECISIONS §print; E3.2 |
| casts | `as` exact-or-null-out, `as?` null, `as!` trap, `as%` low bits, a float target rounds | E8.1–E8.5 |
| `is` on records | exact field set; extra fields do not fit | OPEN-QUESTIONS Q2, today's behaviour (b) |
| map iteration | insertion order, live under deletion | T7.1 |
| a list's `pop` on empty | `null` | narrowing.md (`pop` is `T \| null`) |

**Owner questions.** The oracle declines each of these with a `spec gap:` reason, so none of
them yields a verdict until it is ruled.

1. **A radix literal in a float context.** T2.3 names i32 and i64 contexts only. The compiler
   gives `0xFFFFFFFF as f64` the zero-extended 4294967295, but `0xFFFFFFFF as f32` the i32
   pattern −1, and it refuses `const b: f32 = 0xFFFFFFFF` as "i32 doesn't fit in f32". These
   three answers are inconsistent.
2. **Radix constants under `/`, `%` and the bitwise operators.** E9.1 says a radix literal
   "is a bit pattern at its use's width under every operator". The ring operators commute
   with wrapping, so the oracle folds them exactly and wraps at the use. For `/`, `%`, `&`,
   `|`, `^` and the shifts, the width must be known before the operator runs. Is it the
   final use's width for the whole tree?
3. **Which member a constant adapts to at a join of several numeric types.** T3.6 says
   literals "adapt", but not to which member. The compiler keeps the literal's default type
   and absorbs it into a member it widens into: in `[2.5, f32, i32]`, 2.5 stays f64; in
   `[5, f32, f64]`, 5 becomes f64; in `[9000000000, f64, f32]`, it stays i64. The 90
   `distilled/named/nj2_*` cells pin this behaviour, and the oracle now agrees with it.
4. **`is` on an empty container.** T3.4 makes `is` a value test, and an empty map fits every
   map type by value. The compiler answers from the type the map was built at:
   `d2657_rv3189_k4_generic_twin_pin` expects `2`, where the value test gives `1`.
5. **A body that falls off its end.** S8.1 says a non-`void` function returns on every path.
   The compiler accepts a body whose return type admits `null` and has no `return`, and the
   result is `null`. The D912/D918 rows depend on that.
6. **A map's `.length`.** The compiler accepts it, but T7 names no count.
7. **A stale DECISIONS sentence.** D3043's entry says `print(-(-2147483648))` "still wraps at
   i32". Both E9.1 and the compiler print 2147483648.

## (d) Integration

* **`scripts/oracle/oracle.ts`** has four modes. `run <file>` interprets one program.
  `distilled` judges the cells against `manifest.json` and a grade file (default
  `baseline.jsonl`). `diff <cases> <out>` judges a `vl run --batch` output directory.
  `recording <sweep.jsonl>` compares stdout hashes with a `scripts/sweep.vl` recording, so the
  oracle compiles nothing itself.
* **Verdicts.** `AGREE`; `DISAGREE` (the compiled program printed something else, or trapped
  where the oracle ran); `UNSOUND` (the oracle caught a value where its type forbids, and the
  checker had accepted the program); `COMPILED-BAD` (the program passed check, the compiled
  side failed, and the oracle ran it); `ORACLE-RUNS-REJECTED` (`vl check` refused a cell
  that the oracle runs to its expected output: 617 distilled cells, which are clause-2 leads,
  not verdicts); and `SKIP` (outside the subset).
* **Exit codes.** 0 when every `DISAGREE` and `UNSOUND` is listed in `scripts/oracle/known.txt`.
  1 when one is not. 2 for a usage error or an exhausted budget.
* **CI, per pull request, under the `sweep` label only.** A step in `sweep.yml`'s `diff` job
  runs `oracle.ts recording out/head.jsonl --population scripts/silent-sweep/distilled/
  --budget-ms 30000` under `timeout 60`. It reuses the head recording the sweep already made,
  so it adds no compiles: a measured **1.3 s** over a real 11,931-cell recording, under the
  budget. The verdict step fails on the sweep diff first, then on the oracle. It never runs
  without the label.
* **`scripts/fuzz-sweep.sh`** has a new leg, `oracle`, which runs `scripts/oracle/fuzz.sh`:
  `gen.ts` and `fuzzgen.vl` generate, one `vl run --batch` runs the batch compiled, and the
  oracle runs `diff`. The leg gates like `plain`. Eight seeds of 750 programs take 68 s on a
  4-core box, all but 0.7 s of it in compiling.

## (e) Budgets

| | budget | v1 |
| --- | --- | --- |
| lines | 3,000 | 2,675: `interp.ts` 1,451, `syntax.ts` 689, `oracle.ts` 219, `gen.ts` 192, `fuzz.sh` 56, the smoke test 68 |
| shipped binary and seed | **0 bytes** | 0: nothing under `compiler/`, `std/` or `scripts/vl-host/` changes |
| `deno task test` | +0.1 s | +40 ms |
| per-PR CI | ≤ 30 s, `sweep` label only | 1.3 s |

## The disagreements, every one

**The first distilled run** reported 192 disagreements. After the oracle's bugs were fixed,
3 remained, and they are one compiler bug. The oracle bugs, in the order the runs found them:

* the map-type parse `{[K]: V}`;
* literal adaptation at joins (T3.6);
* a float constant meeting an i32 operand;
* lazy typing of a constant held in a record field, a list element or a `let` (T2.5: the
  slot is typed by later uses);
* `is` taking a whole union type, and the exact field set (Q2);
* operator functions and newtypes;
* S3.5's object braces;
* generic aliases;
* a map's live iteration;
* `pop` on an empty list returning `null`.

**The rows.**

| witness | class | verdict |
| --- | --- | --- |
| `const a: A \| null = { v: 3 }; a is C` (C has a field `s` that `a` lacks) | compiler bug | **D16370**, check-clean silently wrong: prints `then`. 3 distilled cells, whose manifest records the wrong answer |
| `print(if true { 4294967296 } else { (1) })` | compiler bug | **D16371**, check-clean invalid wasm |
| `let x: i64 = 5; print(x++)` | compiler bug | check-clean invalid wasm; the bug #8094 (lane I) fixes, so not filed again |
| `const y: i64 = if c { 7 } else { 9 }` | compiler bug | **D16373**, check-clean invalid wasm |
| the 7 questions in (c) | spec gap | owner questions, declined by the oracle |

**The fuzz runs.** Two seeds, then eight, of the arithmetic and rep generators. Every
disagreement was minimised by deleting one line at a time while the compiled and oracle
outputs still differed. Fourteen of them were oracle bugs:

* float constants computed in doubles instead of exact rationals;
* the signed zero of an exact zero;
* the width of a radix tree, with or without an over-i32 decimal leaf;
* a radix constant cast to a wider integer;
* an `if` join with no context;
* `min`/`max` of constants treated as constants (E9.1 does not list them);
* a float context leaking into bitwise operands;
* a lambda's result delivered to a declared function type.

On the final runs, the 4,000 rep programs all agree. Of the 2,000 arithmetic programs, 1,224
agree, and 116 pass check but build no module. 70 of the 116 carry #8094's spelling, a
value-position postfix on a wide binding. That is a spelling count, but the 19 such programs
of the first batch were reduced to it. The other 46 were reduced line by line: 38 leave an
`if` whose parenthesised arm meets a wider arm (D16371), and 8 leave an `if` of narrow
constant arms at a wider destination (D16373). No `DISAGREE` or `UNSOUND` verdict remains.

**What it costs to keep.** Every new gap the oracle meets is either a `SKIP` with a reason
(the `--skips` table ranks them) or a disagreement someone must classify. Most of the
classification work was in the oracle's literal typing, which is the part of VL that is
static and not dynamic. It is also where the compiler's two invalid-wasm bugs were.
