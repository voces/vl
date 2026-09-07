# The day-one sampler — generating the population nobody named

`scripts/day-one/` generates ORDINARY VL programs — the shapes a tutorial would contain —
in PAIRS, and reports where two spellings of one program disagree. It exists because every
other instrument here samples a population somebody already named:

| instrument | population |
| --- | --- |
| `scripts/capability-probes/run.py` | one hand-written program per ALREADY-KNOWN gap |
| `scripts/silent-sweep/distilled/` | generated over TWELVE FIXED census axes |
| `scripts/capability-probes/matrix.py` | one template, expanded over delivery positions |

None can find a shape nobody thought of. On 2026-09-03 the peer track wrote twenty ordinary
day-one programs by hand; eighteen ran and one was a clean defect (D1473) that every filed
instrument had missed — its refusal is shared with five CLOSED rows, so grouped by sentence
it looked handled. That 1-in-20 was the only rate estimate this repo had for the unsampled
population. This directory turns it into an instrument.

## The unit of generation is a PAIR

Two spellings of one program, differing along ONE axis, both printing a value the generator
computed in Python. The verdict is **agree / disagree**, never runs / refuses.

That is not a presentational choice. **A disagreement is self-validating**: the spelling
that RUNS proves the other one is legal, so a hit needs no judgement about whether the
design permits it. And it triages itself:

| verdict | meaning |
| --- | --- |
| `DISAGREE` | one spelling runs, the other does not — **a defect with its control attached** |
| `RUNS-WRONG` | rc 0, wrong output — a clause-1 miscompile, a hit whatever the twin did |
| `BOTH-FAIL-SAME` / `BOTH-FAIL-DIFFER` | a missing feature or a design question — for a human, listed separately |
| `AGREE-RUNS` | no signal — but the line still records WHAT WAS VARIED |

A single-program fuzzer cannot make that distinction. Of the peer's twenty hand-written
programs, two failures were not defects (`.split` on a string, a std method that does not
exist; `{ ok: true }` as a discriminant, a design question about boolean literal types), and
a single-program fuzzer reports both as gaps. Under pairing they self-classify.

**Every JSONL line carries the axis and the concrete delta** — which type position was named
vs inline, which binding annotated vs inferred, which neighbour present, plus the unified
diff of the two sources. An `agree` with no delta recorded is the unfalsifiable result: it
cannot be told from an axis the sample never reached. The summary reports agreements PER
AXIS for the same reason, and prints `NOT EXERCISED` rather than a zero.

## The axes, in order of expected yield

1. **`named_vs_inline`** — a `type`-named spelling against the fully expanded one, at every
   type position. D1473's axis.
2. **`annotated_vs_inferred`** — the destination annotated or not, at every binding,
   argument, return and field-init. An annotation pins a rep, so any defect whose
   ingredient is *inference doing the pinning instead* is invisible to a fixture that
   annotates (CLAUDE.md, D969).
3. **`narrowing`** — one test, several spellings: `is T`, `== "lit"`, `!= null`, `is null`
   complement, and `match`. ASYMMETRIC where a spelling has no twin (`is` cannot be written for
   an inline arm); that pair is graded on RUNS-ness alone, each side keeping its own expected
   output.

   **`match` is a SPELLING here, not an axis of its own**, and that is what makes it compose:
   a read is orthogonal to every other axis, so one `match` record is immediately crossed with
   named/inline, annotated/inferred, fused/bound, the generic pin, six scopes, five neighbours,
   six sources and nine delivery positions. An axis of its own would only ever pair `match`
   against `match`, which measures nothing the grammar did not already reach. Seven reads
   across six value records: payload BINDING (`Rect{w} =>`) on the two struct unions, a literal
   arm on the literal unions, an OR-PATTERN (`"b" | "c" =>`) on a three-member one, atom arms on
   the value union, and a `null` ARM on both nullables. The struct-payload ones are `named_only`
   for `is Rect`'s reason — an arm names a declared type and the inline face declares none — and
   the literal, atom and prim ones are symmetric, so `named_vs_inline` gets a real `match` pair
   rather than only asymmetric ones. `sunion`'s narrow group had ONE member before, so the
   `narrowing` axis never applied to a union with no literal discriminant at all.

   **Narrowing crosses the generic PIN too** — `is_pin`/`ne_pin` route the whole narrowed value, `match_pin`/`match_null_pin` the bound field, through `thru<T>` so the pin sees the refined rep. Each shares its narrow group with its un-pinned read, so the axis is its own control. The whole-value pins are all AGREE-RUNS; the cross surfaced D1933 (a closure-captured field-sourced nullable), not a pin defect.
4. **`fusion`** — `xs.pop() ?? d` against `const v = xs.pop()` then `v ?? d`.
5. **`pinning`** — a concrete call against the same value routed through a generic
   `pass<T>`, an un-annotated hole parameter, or a TWO-parameter `pass2<A, B>(a: A, b: B): A`
   whose second hole binds a rep of its own.

   **The two-parameter face carries a `same` control, and the control is what fired.** Its
   second-hole table draws seven differing reps (i32, string, f64, boolean, list, struct,
   nullable) and one `same`, which binds both holes to the delivered value's own rep through
   its `alt`. Over 519 `generic2` pairs the seven differing reps produced **0** disagreements
   and `same` produced **18**, five of them check-clean invalid wasm (D1887). An
   all-differing table could not have told "two holes disagree" from "two holes at all",
   which is the same lesson #2854 taught one level down: a grid whose hole is never bound
   cannot see a defect whose ingredient is the binding.
6. **`scope`** — module, function body, `if true` block, and a one-iteration `while`, at
   module and function level.
7. **`scenery`** — the same program with and without a plausible UNRELATED neighbour: an
   `xs.push` (D1401), a `self`-function never called (D1430), an unused higher-order
   declaration (D1100), an unused `type`, an unused import.
8. **`operator_vs_call`** — an OPERATOR against the direct call of a plain function with
   the same body: `v + opW` against `plusVec(v, opW)`. Its faces are read ids, like
   `narrowing`'s, because what differs is the one line that consumes the value, and both
   declarations stand in both faces so a disagreement is about the CALL rather than about
   declaring an operator at all. Grouping is by the OPERATOR and not by expected output —
   `[]` and `[]=` are two groups on one record and several reads print the same number, so
   a `want` key would pair a getter against a setter. `==` / `!=` are the design's bounded
   exclusion (every type compares structurally, and the parser says so), so no record
   declares one: both faces would refuse together and a both-fail is not a hit.

   Five records, and the fifth is the CONTROL. `op_add` (`+`, same-type binary), `op_mul`
   (`*` with an `i32` right operand), `op_cmp` (`<`, whose result leaves the receiver's
   type), `op_index` (`[]` and `[]=`), and **`op_none`: no operator anywhere, a plain call
   against its UFCS twin** — the other dispatch-by-receiver mechanism in the language, so a
   disagreement it shares is about dispatch in general. The receiver is a `new` NOMINAL type
   because the receiver type IS the dispatch key, which is also why these records carry
   `no_inline`.
9. **`init_vs_assign`** — `const v = e` against `let v = <literal>` then `v = e`. The
   literal pins the `let`'s rep and the assignment is where a differently-repped source
   disagrees with that pin.
10. **`modules_split`** — the same program as ONE file and as TWO modules. A GENERATOR axis:
   it has its own grammar (`modules.py`) rather than a face flipped on a plan drawn from the
   tables above, because module scope has two storage classes (wasm globals and
   start-function locals), every module's top level is lowered into ONE start function, and
   several by-name scans see only one class or only one module. D1593 / D1595 / D1596 all
   needed two files to appear and every instrument here was blind to them.
11. **`imports_pair`** — the same program importing ONE std module and importing TWO. Also a
    GENERATOR axis (`imports.py`), and for the same reason: what it varies is the IMPORT
    LIST, which no plan above has. D1514 is the shape — `std:fs` compiled in 18 ms alone,
    `std:array` in 40 ms alone, the module importing BOTH in 5,006 ms — and six sweep rows
    were two features that each worked alone.

Crossed with a **SOURCE** dimension — where the value comes from: a literal, a call, an
index read, a field read, a map read, a `??`. Not interchangeable at the emitter: D1476
needs a projection specifically, and a call initialiser runs.

**MIXED-WIDTH arithmetic is a READ, not an axis**, for `match`'s reason one level down: a
read composes with every axis above, so eleven of them cross the whole grammar at once,
where an axis could only ever pair a widening against a widening. `numWidensName` allows
exactly three lossless edges — `i32 -> i64`, `i32 -> f64`, `f32 -> f64` — and each read
tags itself with the edge it exercises, so the report can say `widen_i32->f64` rather than
counting agreements it cannot attribute. Every operand is a LITERAL, so no read adds a
declaration and the scalar records keep declining `named_vs_inline` exactly as before. The
`f32 -> f64` edge needed a new record: there is no f32 literal, so an f32 value has to come
from an annotated return, which is also why that record has no `expr`.

**Each mixed read has a same-width CONTROL beside it** (`same_add`, tagged `widen_same`), on
the same record and in the same positions. A table of mixed pairs alone cannot tell a
widening defect from a defect the record has at any width; the control is what makes
`0 of 381` a statement about widening.

## What it CANNOT sample

Stated plainly, because a zero from an instrument is only as good as its frame.

* **Anything outside the grammar.** Seventeen value shapes, six sources, nine delivery
  positions, six scopes, five neighbours; the module axis adds twenty-four units and nine
  reports, and the imports axis twelve std modules. No strings beyond `+`/`.length`.
  Generics reach TWO parameters (`pass2<A, B>`) and no further. Operator overloading reaches
  `+ - * / %`, `< > <= >=` and `[]`/`[]=` on ONE nominal receiver; `==` / `!=` are refused by
  the design, so no pair can be written for them.
  Mixed-width arithmetic reaches only the three LOSSLESS edges and only with a literal on
  one side; the lossy edges the design refuses are graded by hand (D1890), because both
  faces of a pair refuse them together.

  **RECURSIVE types are in the grammar and bring their own limit**: `Node` (self-recursive
  through a nullable field), `Tree` (through a list) and the mutually-recursive `Leaf`/`Branch`
  are records, and `named_vs_inline` DECLINES all three — expanding a name inside itself does
  not terminate, so the axis reports `NOT EXERCISED` rather than rendering a face that is a
  different program. They ship with `rec_flat`, a NON-recursive record of the same field shape
  and the same reads: it is the control that lets a hit say *recursion* rather than *this field
  shape*, and on the sample that found D1889 it stayed green while `rec_mutual` did not.

  `std:` reaches the single-file axes only as an unused import
  (the `unused_import` neighbour) and the imports axis only as one call per module, so no
  std VALUE — a `Json` tree, an `IoError`, a `Buf` — is ever delivered or read by the plans
  above. Each is a grammar record away, and none is there today.
* **More than TWO modules, and a print from an imported one.** The split moves a
  dependency-closed subset into one imported module and every `print` stays in the entry,
  so the two faces cannot differ merely because a module's start function ran first. A
  three-module graph, a re-export, and a module that prints are all out of frame.
* **Programs longer than ~25 lines.** The generator builds one value, delivers it once and
  reads it once. A defect that needs two interacting values is out of frame.
* **Anything whose expected output Python cannot compute.** That is the price of grading on
  output rather than on rc, and it is worth paying: it is what makes `RUNS-WRONG` visible.
* **A defect both spellings share.** By construction a pair reports `BOTH-FAIL`, which is
  the honest answer — but a gap the whole grammar shares is invisible as a *hit*.
* **`--exclude` blind spots.** A single broken neighbour floods a sample; excluding it to
  see past it is a deliberate narrowing of the frame and belongs in any quoted number.

## The controls — and why none of them is a live defect any more

    python3 scripts/day-one/sample.py --control

**A CONTROL BUILT ON A LIVE DEFECT EVAPORATES THE DAY THE DEFECT IS FIXED.** The first
version of this suite used D1473 for exactly that job — the row that motivated the whole
instrument — and D1473 closed (#2476) two days later. Its pair started grading `AGREE`, the
gate read a closed row as a broken instrument, and #2478 failed CI six rounds in a row before
anyone read the message rather than the exit code. D1500 went the same way (#2479) within the
hour.

So the controls split in two, and the split is the lesson:

| control | pair | asserts |
| --- | --- | --- |
| `synthetic/check` | `const v: i32 = 7` vs `const v: i32 = "seven"` | `DISAGREE`, `RUNS` / `check refuses` |
| `synthetic/trap` | `xs[1]` vs `xs[9]` on a 2-element list | `DISAGREE`, `RUNS` / `TRAP (program)` |
| `synthetic/wrong` | `print(2)` vs `print(12)`, both wanting `2` | `RUNS-WRONG`, `RUNS` / `RUNS-WRONG` |
| `D1473/agree` | named arms vs INLINE arms, from the grammar | `AGREE-RUNS`, `RUNS` / `RUNS` |
| `D1500/agree` | `const v = xs[0]` vs `let v = 0` / `v = xs[0]` | `AGREE-RUNS`, `RUNS` / `RUNS` |
| `synthetic/modules-check` | an imported `i32` into `const v: i32` vs `const v: string` | `DISAGREE`, `RUNS` / `check refuses` |
| `D1593/agree` | a module's loop variable beside the importer's block `const n` | `AGREE-RUNS`, `RUNS` / `RUNS` |
| `D1595/agree` | the same collision at a string, where the scratch frame is detected | `AGREE-RUNS`, `RUNS` / `RUNS` |
| `D1596/agree` | a hole parameter fed from a block `const` across the import | `AGREE-RUNS`, `RUNS` / `RUNS` |
| `synthetic/imports-check` | a std `string` result into an `i32`, two std imports deep | `DISAGREE`, `RUNS` / `check refuses` |
| `imports_pair/agree` | `std:array` alone against `std:array` + `std:fmt`, from the grammar | `AGREE-RUNS`, `RUNS` / `RUNS` |

The three **synthetic** ones prove the sampler can still SEE and CLASSIFY a disagreement, and
each rests on a rule the design will always enforce: a type error, a bounds-checked index, an
exact output contract. Nothing can "fix" them into agreeing. The two **agree** controls are
the closed rows, kept as regression pins — which is the right shape for a closed row anyway:
it pins the fix instead of depending on the bug.

Three of them earn their place beyond liveness. `synthetic/trap` is the only control that
exercises the extra `vl build` this script runs to tell a PROGRAM trap from a COMPILER trap,
which is the one piece of grading it adds to `capability-probes/run.py`'s. `synthetic/wrong`
is the only one that would fail if the output contract went back to `run.py`'s SUBSTRING
test, which passes `"2"` against a printed `"12"`. `synthetic/modules-check` is the only one
that says outright that the multi-file WRITER delivered two files: the three module agree
pins would also fail if the imported section were dropped — their import would not resolve —
but they would fail for a reason nobody could read off the exit code. Validated by sabotage:
making `split_files` return only the last section makes all four say `NOT SPEAKING`, and the
synthetic one names the difference (`BOTH-FAIL-SAME`, both faces `check refuses`).

**There is no synthetic EMIT-refusal control, and that is a statement about the language.**
By CLAUDE.md's standing rule every `loud emit reject` is a clause-2 violation by
construction — `check` returned 0 to reach the emitter, so either the program is legal and
should compile or the CHECKER owed the diagnosis. No emit refusal is therefore a design rule,
and none can be a permanent control. `synthetic/trap` covers what such a control would have
given: a deterministic non-check channel that will still be there next year.

**AN AGREE PIN'S CONTRACT IS WRITTEN OUT, NEVER TAKEN FROM THE RENDERER IT PINS.**
`imports_pair/agree` was first written with `want` read from the same `I.render(…)` call it
was grading, and the sabotage that MUST fire — making the two-import face drop its second
import — passed, because the pin's expectation moved with the program. Spelled by hand
(`["3"]` and `["3", "41!"]`) the same sabotage prints `imports_pair/agree … NOT SPEAKING`
and exits 1. A control whose contract comes from the thing under test cannot fail; this is
the same fault as a probe validated against no failing control, one layer up.

Validated the way any control must be, against a sabotage that MUST fire: changing
`synthetic/wrong`'s expected output so the pair agrees makes the suite print
`synthetic/wrong … NOT SPEAKING` and exit 1, naming the want and the got.
`tests/vl_day_one_sampler_test.ts` runs all eleven on every gate, and additionally requires at
least three SYNTHETIC controls to be grading a disagreement — a suite of agree-pins alone
passes on an instrument that has stopped speaking entirely.

## The first sample — and what two closed rows did to it

Seeds 101–104, 160 programs each: **320 pairs = 640 programs**. Cost is not the constraint —
a 640-program run finishes in **3.5 s wall at `--jobs 8`** against a warm seed — so the size
of a discovery run is limited by what the grammar can express, not by the clock.

The same four seeds were graded on two compilers a day apart, which is the most useful thing
in this document: **the instrument's own numbers moved with the rows that closed.**

| | `cdfdc14e` (2026-09-03) | `d109927a` (after #2476, #2479, #2480) |
| --- | --- | --- |
| `AGREE-RUNS` | 239 | **248** |
| `DISAGREE` | 28 | **22** |
| `BOTH-FAIL-SAME` / `-DIFFER` | 44 / 9 | 43 / 7 |
| programs `RUNS` | 506 | **518** |
| `emit refuses` | 113 | 107 |
| `check refuses` | 8 | 8 |
| `SILENT (check rc 0)` | 7 | 7 |
| `COMPILER TRAP (check rc 0)` | 6 | **0** |

D1473's close took five `named_vs_inline` hits with it (12 → 7) and D1500's took every
compiler trap (6 → 0). The `cdfdc14e` column was itself graded three times — off a one-step
seed, off the proved fixpoint (2,043,139 bytes), and off the fixpoint after a rebase onto
`a9baf597` (2,046,160 bytes) — byte-for-byte the same table each time. That matters because
a single self-compile off a stale seed is the PREVIOUS compiler's codegen: the first of those
three readings is the one that would have lied.

Per axis on `d109927a` — `hit` is `DISAGREE` + `RUNS-WRONG`:

| axis | pairs | hit | agree | both-fail |
| --- | --- | --- | --- | --- |
| `named_vs_inline` | 52 | 7 | 33 | 12 |
| `annotated_vs_inferred` | 82 | 7 | 70 | 5 |
| `narrowing` | 10 | 0 | 9 | 1 |
| `fusion` | 26 | 2 | 19 | 5 |
| `pinning` | 44 | 4 | 32 | 8 |
| `scope` | 35 | 0 | 25 | 10 |
| `scenery` | 43 | 1 | 37 | 5 |
| `init_vs_assign` | 28 | 1 | 23 | 4 |

Highest hit rates per feature, which is how to aim the next sample: `shared` 4/18 (22.2%),
`eq_narrow` 4/22, `strfield` 2/12, `assignment` 4/25, `struct_field` 5/32, `closure_capture`
6/39, `litunion` 3/20. At the bottom: `scalar`, `bare`, `string`, `forin`, `map_value`,
`global_init`, `f64`, `return` — all 0.

**The rate is 6.9% of PAIRS, not 1 in 20 of programs, and the two numbers are not
comparable.** A pair is two programs and a hit needs a disagreement, so a hand-written
1-in-20 and a generated 22-in-320 measure different things. What IS comparable is that the
generated population is dominated by a handful of mechanisms — one of them, D1474, accounting
for 41 of 69 non-agreeing pairs in the exploratory run — which a hand-written batch of twenty
would never have shown.

## What it found, grouped by ABLATION

Never by message: `field access but no struct type declared` is shared with five closed
rows, and `field access receiver is not a struct` turned out to be the SAME mechanism at a
different delivery. Counts below are from the `cdfdc14e` run unless a row says otherwise;
the three rows filed here still refuse on `d109927a`.

### Filed by this session

* **D1474** — `const apply = (f: (i32) => i32) => f(1)`, uncalled. Loud emit reject,
  clause 2. **41 of the 69 non-agreeing pairs in the exploratory sample carried it**,
  because the sampler draws it as an unrelated NEIGHBOUR and it breaks every program it
  shares a module with. Ablated to eight rows: a named `function` runs, an unrelated
  arity-1 call anywhere runs, an annotation on the binding runs.
* **D1475** — a module-scope lambda capturing a closure-typed binding and returning it.
  Check-clean invalid wasm, clause 1; the identical four lines inside a function print `5`.
  Its un-annotated face is a loud emit reject, so the gap sits in two clauses at once.
* **D1476** — an inferred binding whose initialiser is a PROJECTION (`xs[0]`, `box.it`) of
  a struct, captured by a lambda. Check-clean invalid wasm; annotating the binding, using a
  call as the source, or a scalar element all run, and plain module scope runs too.

### Found while both rows were still open — now closed, and kept as agree controls

* **D1473**, which the sampler found at TWO messages. On `cdfdc14e`, `field access receiver
  is not a struct` (10 hits) had the same ablation as `field access but no struct type
  declared` (2 hits): inline arms plus an arm-specific read after a literal-discriminant
  narrowing, with `named_vs_inline` alone deciding. Closed by #2476.
* **D1500**, the `let len = 0` / `len = xs[0]` compiler crash, as `COMPILER TRAP (check rc
  0)` — 6 of 160 programs on an aimed `init_vs_assign` run. The minimiser added a fact the
  row's own repro does not carry: the scope is free between function, block and `while`,
  and plain MODULE scope runs. Closed by #2479.

**And D1473's close left residue the sampler still reports, in the opposite direction.** On
`d109927a` the same two messages persist at 4 and 2 hits, and the minimised witness now has
the NAMED face refusing while the INLINE face runs — the reverse of the row. It needs a `??`
over a nullable named union delivered through a hole parameter into a re-assigned `let`,
read at the shared discriminant:

    type Circle = { kind: "circle", r: f64 }
    type Rect = { kind: "rect", w: f64, h: f64 }
    type Shape = Circle | Rect
    function mkval(): Shape { return { kind: "rect", w: 2.0, h: 3.0 } }
    function passh(x) { return x }
    function go() {
      const srcOpt: Shape | null = passh(mkval())
      let v = (srcOpt ?? { kind: "circle", r: 1.0 })
      v = (srcOpt ?? { kind: "circle", r: 1.0 })
      print(v.kind)
    }
    go()

Annotating `v`, or spelling the union inline, each make it run; `is`-narrowing instead of the
shared read makes it check-clean invalid wasm. Not filed — no reserved id left in this
session's block — and listed here for triage.

### Taken by the coordinator's triage — D1515, D1516, D1517 (closed)

The three the coordinator took are closed, and **two of the three lines below were wrong
about their own witness** — which is why each was re-minimised against a FRESH seed before
being fixed. The sampler is right; a hand-written summary of it goes stale like any other
citation, and one of the three had already closed under it.

* **D1515** was filed as "reached through `pass<T>`". The generic pin is SCENERY: the
  ingredient is the list's PRODUCER — a call result or a bound list rather than an array
  literal of object literals — and the filed witness itself had already closed with D1443 by
  the time it was re-run.
* **D1516** was filed as "two hole parameters in a chain". That shape does refuse, and so
  does a single hole fed by any PROJECTION (`xs[0]`, `b.it`, `m[k] ?? d`); the chain is one
  member of that family, not the family.
* **D1517** was filed as "over a module-scope global … the same program inside a function
  runs". It refuses at every scope. The ingredient is the `??` fused onto an `as?` whose
  target arm is NUMERIC — `as? string` and `as? boolean` run, their `T | null` being a niche
  that needs no box row.

### Not filed — for the coordinator to triage

Each was minimised and ablated; none is filed here, either because it is a documented
inference limit, because both spellings fail, or because the session ran out of reserved
ids. Cited by the pair that produced them; every one still reproduces on `d109927a`.
**Re-minimise against a fresh seed before scheduling one** — see the three above.

| what | witness (minimised) | note |
| --- | --- | --- |
| `emitProgram: ref valtype with no interned shape` — a nullable struct through a hole param into an inferred struct field | `const box = { item: passh(mkval()) }`, `box.item`, `!= null` | annotating the destination runs |
| `emitProgram: only i32 locals are supported` — a literal union spelled INLINE, read out of a list element and `==`-narrowed inside a block | `const arr: ("red" \| "green")[] = [mkval()]` / `arr[0]` / `== "red"` | the `type Color` spelling runs; at MODULE scope the same program is check-clean invalid wasm instead |
| `emitProgram: object literal matches no union variant` — a struct through a hole param into an inferred struct field | `const box = { item: passh({ name: "ada", n: 3 }) }` / `box.item.name` | direct runs; `pass<T>` refuses differently |
| `emitProgram: call to unknown function` — a closure captured and returned inside a MODULE-scope block | `if true { const held = (x: i32) => x + 1; const get = () => held; print(get()(4)) }` | function body and `fn_block` both run; D1475's neighbour |
| `[ERROR]: argument 1: expected {size: _}, got {[string]: i32}` and `for-in expects an array or map, got _` and `member access '.n' on non-object _ \| null` | an un-annotated parameter used as a map, iterated, or read through `??` | hole-param inference limits; the checker's own sentences say so, and each has an annotated twin that runs. A DESIGN question, not obviously a gap |

## The `modules_split` sample — 1,640 pairs, one disagreement mechanism

Graded on 2026-09-04 in four runs, because a discovery run that cannot look PAST the family
it has already named stops measuring after the first one. `--replay` re-grades all 3,280
programs against this branch's own proved fixpoint seed with **0 moved and 0 RUNS lost**, so
the table is not one self-compile off a stale seed:

| run | pairs | `DISAGREE` | `AGREE-RUNS` | `BOTH-FAIL` |
| --- | --- | --- | --- | --- |
| `--axis modules_split`, seeds 101–104 | 640 | 23 | 577 | 40 |
| mixed, seeds 201–202 (the axis's own share of 320) | 40 | 2 | 34 | 4 |
| `--axis modules_split --exclude rep_global_ann,rep_global_infer`, seeds 301–303 | 480 | **0** | 444 | 36 |
| …also `--exclude` the three hole-parameter reports, seeds 401–403 | 480 | **0** | 480 | **0** |
| total | **1,640** | **25** | **1,535** | **80** |

**Every one of the 25 disagreements is D1597 and every one of the 80 both-fails is D1598** —
attributed by re-rendering the spec, not by the message, which is why the two `--exclude`
runs are in the table: they are what says the axis's whole yield at this grammar is two
mechanisms and not a tail. The mixed run also gives the axis's natural share, **40 of 320
pairs (12.5%)**, which is what a plain `sample.py --count N` will spend on it.

* **D1597** — a module GLOBAL and a same-named binding in a top-level BLOCK are one slot.
  Check-clean SILENTLY WRONG VALUE at a numeric or string global, check-clean invalid wasm
  struct-on-struct, a loud emit reject at mixed reps. **The defect needs the program to have
  NO IMPORTS**: any second module, including an unused `import { trim } from "std:str"`,
  makes it run, because the merge mangles top-level names per module. That is why the pair
  is a disagreement with the SINGLE face failing, and why no cross-module fixture in the
  tree could see it.
* **D1598** — two sibling top-level blocks binding one name make a hole parameter's
  module-frame pin decline even when both bindings have the SAME type. It fails identically
  in both faces, so it is a both-fail rather than a hit; the axis's contribution is that it
  is 80 of 80 of them.

Neither is reachable by the single-file axes: the `scope` axis picks ONE scope for the whole
program, so no plan it draws composes a module-scope block with a module-scope global.

## The `imports_pair` sample — the axis's whole population, and no D1514 shape left

Graded 2026-09-06 against master `dcbf7521c`. Twelve std modules is **132 ordered pairs**, and
`--axis imports_pair --count 300` draws every one of them, so this is not a sample of the
axis — it is the axis:

    132 pairs = 264 programs · 0 of them multi-module

    pair verdicts
      AGREE-RUNS                  132

    program grades
      RUNS                        264

**Zero disagreements and zero both-fails.** A second std import in the same module changes no
outcome at this grammar. Its natural share of a mixed run is **86 of 1,000 pairs (8.6%)**
(seeds 6001–6002), also all `AGREE-RUNS`.

The TIMING half is the reason the axis exists, and it is a separate report because it needs
THREE programs — `together` read against the SUM of the two alone-times, which is what D1514
measured and what no two-program pair can express:

    python3 scripts/day-one/sample.py --imports-report run.jsonl

66 unordered pairs, min of 3 `vl build` runs each, at `--jobs 2` on a contended box:

| first | second | aloneA | aloneB | together | ratio |
| --- | --- | ---: | ---: | ---: | ---: |
| `std:seed` | `std:args` | 14.0 | 41.7 | 72.0 | 1.29 |
| `std:test` | `std:json` | 22.0 | 102.7 | 123.8 | 0.99 |
| `std:json` | `std:base64` | 101.9 | 17.0 | 109.0 | 0.92 |
| `std:array` | `std:fs` | 16.5 | 46.4 | 54.4 | 0.87 |
| … | | | | | |
| `std:base64` | `std:buffer` | 17.7 | 55.5 | 26.6 | 0.36 |

**0 of 66 pairs over 3× the sum**, and most are BELOW 1.0 — two imports cost less than two
one-import compiles because the seed's own start-up is paid once. The D1514 shape (`std:fs`
+ `std:array` at 5,006 ms against 58 ms of alone-time, a ratio of 86) does not survive
anywhere in this pool: that pair reads **0.87** here.

**Read the VERDICT, not a single row's milliseconds.** Three runs of this report on the same
tree (`--jobs 6`, `--jobs 2` twice) all said `0 pair(s) over 3.0x`, but the worst ratio moved
between **1.13 and 1.36** and which pair was worst changed each time — a min of three builds
on a shared box still carries the neighbours' load. The bar is 3× for that reason: it is set
to catch an 86, not to rank a 1.2.

## The mixed-width reads — 381 pairs, 0 disagreements, and the gap they did not find

Eleven reads over four scalar records (`i32`, `i64`, `f64` and the new `f32`), at seeds
601-608, 800 programs each:

| | pairs | AGREE-RUNS | DISAGREE | BOTH-FAIL-SAME | BOTH-FAIL-DIFFER |
| --- | --- | --- | --- | --- | --- |
| before, whole sample | 3,200 | 3,037 | 75 | 78 | 10 |
| after, whole sample | 3,200 | 3,058 | 62 | 64 | 16 |
| after, on a mixed-width read | 381 | **381** | 0 | 0 | 0 |

The whole-sample movement is the RNG stream re-shuffling, not a result: adding reads changes
which programs each seed draws. The row that carries the finding is the third, and it splits
`widen_i32->i64` 112, `widen_i32->f64` 90, `widen_same` 126, `widen_f32->f64` 30,
`widen_lit->f32` 23 — every one at zero, across six delivery axes (117
`annotated_vs_inferred`, 69 `scenery`, 62 `pinning`, 57 `scope`, 42 `fusion`, 34
`init_vs_assign`). The three lossless edges are delivered correctly at every position the
grammar reaches, and the control column is what makes that a statement about widening.

**The gap is on the edges a pair cannot see.** A program the design refuses fails in BOTH
faces, so the sampler reports it as a both-fail and never as a hit. Running the refused
edges by hand — seven delivery positions over eight literal/target cells — found one row
that should not refuse: `const a: f64 = 2147483648` is a `loud check reject` while `const a:
f32 = 2147483648` runs, because the f32 target has an exactness-gated literal-adoption
predicate and the f64 target rides the `i32 -> f64` lattice edge alone (D1890). The refused
VALUE edges (`i64 -> f64`, `i32 -> f32`, every narrowing) refuse uniformly at all seven
positions and are the design's rule, not a hole.

## The `operator_vs_call` sample — 443 pairs, 15 disagreements, and the control that stayed green

Seeds 701-708, 800 programs each, before and after:

| | pairs | AGREE-RUNS | DISAGREE | BOTH-FAIL-SAME | BOTH-FAIL-DIFFER |
| --- | --- | --- | --- | --- | --- |
| before, whole sample | 3,200 | 3,043 | 72 | 74 | 11 |
| after, whole sample | 3,200 | 3,044 | 69 | 80 | 7 |

The whole-sample numbers barely move — the RNG stream re-shuffles and the new records take
their share of the draws — so the row that carries the result is the per-record one:

| record | pairs | AGREE-RUNS | not AGREE |
| --- | --- | --- | --- |
| `op_add` | 117 | 109 | 6 DISAGREE · 2 both-fail |
| `op_index` | 123 | 115 | 5 DISAGREE · 3 both-fail |
| `op_mul` | 68 | 65 | 2 DISAGREE · 1 both-fail |
| `op_cmp` | 66 | 64 | 2 DISAGREE |
| **`op_none` (control)** | **69** | **69** | **0** |

The control is the whole point of the table. `op_none` reaches the same function by a plain
call and by UFCS, at the same positions and under the same axes, and every one of its 69
pairs agreed — so the fifteen disagreements are about OPERATOR dispatch and not about
dispatch, about nominal receivers, or about the `mkval` shape all five records share.

**Every disagreement is at the `argument` position** — an un-annotated parameter — and none
is at the other eight. Four ablated rows:

| row | outcome | the sentence |
| --- | --- | --- |
| D1891 | loud check reject | `comparison expects numeric operands, got _ and Ord` |
| D1892 | **loud EMIT reject**, `vl check` rc 0 | `emitProgram: index access but array type not collected` |
| D1893 | loud check reject | `argument 1: operator '*' is not defined for Sca and i32` |
| D1894 | loud check reject | `argument 1: expected {x: _}, got Pln` |

They are four mechanisms, not one message split four ways. D1891 is the operator resolved on
the LEFT operand alone, so a hole there never reaches the table — `opO < p` and the two-hole
`p < q` both RUN, which is what says it is the position and not the operator. D1892 is the
brackets going through CHECK and dying in the emitter, with three different sentences
depending on unrelated module content. D1893 is scenery: **any** `std:` import (fmt, array,
json, str all tested) makes an operator on a hole refuse where the identical import-free
program prints `12`. D1894 is the solve synthesising a structural `{x: _}` from a field read
and then refusing the `new`-branded argument, with no operator and no import in the witness.

## The narrow x generic-pin cross — 149 pairs, 0 pin-borne disagreements, and a 4-way both-fail it surfaced

The first of the two-feature cross-products: a value narrowed by `match` or `is`/`!= null`,
THEN routed through a generic hole (`thru<T>`), so the pin sees the REFINED member's rep and
not the union box's. Four reads on the two union records — `is_pin` and `ne_pin` pin the whole
narrowed VALUE, `match_pin` and `match_null_pin` the bound field — each sharing its narrow
group with the un-pinned read beside it, so the `narrowing` axis pairs pinned against
un-pinned as its own same-shape control. A single record that only paired its two features
with themselves would measure nothing; these compose with every axis.

Seeds 801-808 x 800 (before/after) and a wider 811-816 x 1000:

| | pairs | AGREE-RUNS | DISAGREE | BOTH-FAIL |
| --- | --- | --- | --- | --- |
| before (no cross reads), whole sample | 3,200 | 3,084 | 45 | 71 |
| after, whole sample | 3,200 | 3,073 | 52 | 75 |
| after, on a cross read | 77 | 67 | 3 | 7 |
| wide, on a cross read | 72 | 67 | 2 | 3 |

**The whole-value pins compose cleanly.** `is_pin` and `ne_pin` — the reads that pin a
refined union member or a narrowed non-null, where a rep defect would live — are 100%
AGREE-RUNS across both samples. Pinning a narrowed rep through a generic hole is sound.

**Every cross DISAGREE is the un-pinned control's too.** The `match_pin` disagreements all
carry `match scrutinee must be a union or an integer, got _` — the match-over-a-hole-parameter
refusal (D1885/D1886), present identically in the before sample (28 vs 27 occurrences) and in
the un-pinned twin: removing `thru` leaves `match p { … }` on the same `_` and it fails the
same way. The pin is scenery there, not a defect.

**The cross surfaced a defect of a DIFFERENT cross.** A both-fail carried
`emitProgram: ref valtype with no interned shape`, present in the before sample too (the pin
is scenery). Delta-debugged to a four-ingredient witness — a closure capturing a FIELD-sourced
nullable, inside a block, then narrowed — each ingredient load-bearing, filed as **D1933**. It
is exactly the cross-product blindness the sampler exists for: no single-feature fixture
reaches it, and the non-null twin is its own control.

## The operator x mixed-width cross — 372 pairs, 0 width-borne disagreements

The second two-feature cross: an overloaded operator whose BODY crosses widths. `op_mixw_mul`
is `"*"(self: Mw{x: i32}, k: f64): f64` — `self.x * k` widens `i32 -> f64` inside the
dispatch; `op_mixw_add` is `"+"(self: Aw{x: i32}, k: i64): i64` for the `i32 -> i64` edge. Both
join `operator_vs_call` (their `op`/`call` reads carry an `op` key) and tag `opw_mix`.
`op_samew` is the same-shape control — the identical operator over an `f64` field, so
`self.y * k` is `f64 * f64` with no widening — tagged `opw_same`. A record that only paired a
mixed operator with itself would measure nothing; the same-width record is what makes a hit
falsifiable.

Seeds 901-908 x 800 (before/after) and a wider 911-916 x 1000:

| | pairs | AGREE-RUNS | DISAGREE |
| --- | --- | --- | --- |
| after, on a mixed-width operator (`opw_mix`) | 132 | 129 | 3 |
| after, same-width control (`opw_same`) | 58 | 58 | 0 |
| wide, `opw_mix` | 124 | 124 | 1 |
| wide, `opw_same` | 56 | 56 | 1 |

**A clean negative.** The mixed-width operator bodies compose correctly at every delivery
position and both spellings. Every disagreement — and there is one on the SAME-WIDTH control
too — carries `` `take` prints its type parameter here ``: the operator reached through an
un-annotated parameter with a `std:` import in the graph, which is [D1893](inventory/D1893.md)
(fixed in flight), width-independent by construction. The plainest witness confirms it: the
mixed `Mw` and the same-width `Sw` refuse identically with the import and run identically
without it. Overloaded-operator dispatch does not care that the body widens.

## The init_vs_assign x union-narrowing cross — 322 pairs, 0 wrong values, a rep-interaction clean negative

The third two-feature cross, and the first aimed at a REP interaction rather than a dispatch
one. `Mix = i32 | Rec` has a SCALAR arm (a boxed `i32`) and a STRUCT arm (a boxed ref) —
genuinely different reps. `mix_cross`'s value is the `Rec` and its `alt` is the scalar `5`, so
the `init_vs_assign` axis's `assign` face is `let v: Mix = 5` then `v = mkval()` — a
reassignment ACROSS the rep boundary. `mix_cross_rev` crosses the other way (scalar value,
struct `alt`). The narrow-and-read then surfaces a wrong STORED rep as a wrong VALUE, not just
a wrong type. `mix_same` reassigns another `Rec` over the `Rec` — the same-arm control that
separates a cross-rep defect from a plain assignment bug.

Seeds 1001-1008 x 800 (before/after) and a wider 1011-1016 x 1000:

| | pairs | AGREE-RUNS | DISAGREE | RUNS-WRONG |
| --- | --- | --- | --- | --- |
| on a cross record (`xrep_cross`) | 225 | 201 | 17 | 0 |
| same-arm control (`xrep_same`) | 97 | 88 | 7 | 0 |
| the `init_vs_assign` axis itself, on a cross record | 27 | 27 | 0 | 0 |

**A clean negative, and the sharpest of the three.** No cross-rep pair ever produced a wrong
VALUE — a wrong stored rep would, and none did. The `init_vs_assign` axis, which is the one
that actually varies the reassignment (direct-init vs seed-then-reassign-across-the-boundary),
is 100% agreement: reassigning a struct over a scalar-seeded union slot, or the reverse, reads
back exactly what a direct init does.

Every disagreement is rep-independent and shared by the same-arm control: `match scrutinee
must be a union or an integer, got _` (the match-over-a-hole-parameter refusal, D1885/D1886)
and `field 'n' is not on every member of Mix` (narrowing a CALL result, which does not carry
to a second call of it — a fact about places, not reps). Both appear in `xrep_same` at the
same rate. The scalar/struct rep boundary is crossed soundly.

## The operator x modules_split cross — cross-module resolution is SOUND, and a single-file miscompile fell out (D1934)

The fourth cross, and the first to BITE. An overloaded operator is a free `self`-function
resolved by receiver type and BANKED per call node for the emitter's dispatch rewrite — the
thing D1891/D1892 turned on. That bank is written where `a + b` is checked and read where it
is emitted, so an operator declared in the moved module and used in the entry is the one seam
a single-file sample cannot reach. Three new `modules.py` units — `ty_vec`, `op_vadd`,
`op_vmul` — and three reports that use them (`rep_op_add`, `rep_op_mul`, `rep_op_hole`) put
the `a + b` in the entry; `operator_moved` marks the pairs where the operator crossed.

Seeds 1101-1108 x 800 (before/after) and a wider 1111-1116 x 1200, `--axis modules_split`:

| | pairs | AGREE-RUNS | DISAGREE |
| --- | --- | --- | --- |
| before (no operator units) | 3,200 | 3,200 | 0 |
| after | 3,200 | 3,168 | 32 |
| operator crossed the boundary (`operator_moved`) | 848 | 826 | 22 |
| of those, where the SPLIT face failed | — | — | **0** |

**Cross-module operator resolution is sound.** Over 848 pairs where the operator was declared
in the module and used in the entry, the SPLIT face never failed: the per-node dispatch bank
survives being written in one module and read in another. That is the clean-negative half.

**But the cross surfaced a single-file miscompile.** All 65 operator disagreements are the
SINGLE face going check-clean invalid wasm — the compiler itself prints "this is a bug in vl".
Delta-debugged to four ingredients: a `"+"` operator overload declared anywhere, a name bound
as a ref (`Vec`) at module scope and shadowed by a `string` in a block, and a string `+` on
that shadowed name. Declaring an operator routes every `+` through the operator-dispatch
lowering, and the cross-rep name collision then mis-reps the string concat (D1934). The
sampler's `modules_split` axis assembled the ingredients; its `single` face is where they
fire, so this is not a cross-module defect — it is a single-file one the cross reached.

## The std-import x shadowed-name cross — 508 pairs, 0 wrong values, the ambient-effect analogue of D1934

The fifth and last cross. D1934 was a GLOBAL effect (a `"+"` overload changes every `+`'s
lowering) meeting a LOCAL rep decision (a name shadowed across scopes). A `std:` import is the
other global effect the language has — a module-graph edge with a start function of its own —
so this crosses it with the same local rebind: a `rep_shadow` report binds `shdw` as a module
`Cell` (a ref) and shadows it with a block `const shdw = "hi"` (a string), reading both, while
`modules_split` moves a `std:str` / `std:array` / `std:buffer` import into the module.

Seeds 1201-1208 x 800 and a wider 1211-1216 x 1200, `--axis modules_split`:

| | pairs | AGREE-RUNS | not AGREE |
| --- | --- | --- | --- |
| before (no shadow report) | 3,200 | 3,200 | 0 |
| after, shadow report | 508 | 508 | 0 |
| shadow with a std import MOVED to the module | 54 | 54 | 0 |

**A clean negative.** The shadow's rep is resolved correctly whether or not a `std:` import is
in the graph and whichever side of the module boundary it sits on — 0 wrong values, 0 silent
wasm. The import's start function is an ambient effect on ORDER, not on name resolution or
lowering, so it does not collide with a local rebind the way an operator overload did. D1934
was operator-specific: the string `+` only routed through the wrong binding because a user
`"+"` existed, and that is now fixed.

## Five two-feature crosses: composition is sound; the defects live at name-resolution seams

The two-feature sweep ran five crosses and stops here:

| cross | result | defect |
| --- | --- | --- |
| narrow x generic-pin | clean (pin composes) | D1933 (incidental: a 4-way closure-capture emit reject) — FILED |
| operator x mixed-width | clean negative | — (the one disagreement was D1893, control-shared) |
| init_vs_assign x union-rep | clean negative (0 wrong values) | — |
| operator x modules_split | cross-module resolution SOUND; a single-file seam exposed | D1934 — found and FIXED |
| std-import x shadowed-name | clean negative | — |

**Feature COMPOSITION is sound.** Every cross that measured a composition — pinning a narrowed
rep, a mixed-width operator body, reassigning across a union's rep boundary, resolving an
operator across a module boundary, a std import beside a shadow — came back a clean negative,
its disagreements rep-independent and shared by a same-shape control. The cross-module dispatch
bank the brief singled out survives being written in one module and read in another.

**The two defects the sweep surfaced are name-resolution SEAMS, not composition bugs.** Both
are a global/ambient effect meeting a local rep decision: D1934 is a `"+"` overload's global
lowering meeting a name shadowed across scopes (`structIndexOfExpr` resolved the shadow by name
to the wrong binding) — found by `operator x modules_split`, FIXED. D1933 is a closure capture
of a field-sourced nullable inside a block, a four-ingredient cross — found by `narrow x pin`,
FILED. Neither is reachable by a single-feature fixture; that a random program generator paired
the ingredients is exactly the value the sampler was built to have. The productive remaining
territory, if the sweep resumes, is more ambient x local seams — not the plain feature x
feature grid, which these five show composes.

## Running it

`--count` counts PROGRAMS, so it is twice the number of pairs.

    python3 scripts/day-one/sample.py --seed 1 --count 400 --out run.jsonl
    python3 scripts/day-one/sample.py --seed 1 --count 400 --axis named_vs_inline
    python3 scripts/day-one/sample.py --seed 1 --count 400 --exclude hof
    python3 scripts/day-one/minimise.py run.jsonl --both
    python3 scripts/day-one/file_row.py run.jsonl --index 7 --title "…" --write
    python3 scripts/day-one/sample.py --replay run.jsonl
    python3 scripts/day-one/sample.py --report run.jsonl other.jsonl
    python3 scripts/day-one/sample.py --imports-report run.jsonl

**The big sample is a DISCOVERY run, not a gate.** What is in the gate is
`tests/vl_day_one_sampler_test.ts`: a fixed-seed 40-program sample plus the eleven controls,
**350 ms**, reached by `gate.sh`'s ci-native row and by CI's `tests/vl_*_test.ts` glob. It
asserts four things, none of which is a hit count — the grade vocabulary (so `sample.py`
and `capability-probes/run.py` cannot drift), that every axis the grammar declares was
varied at least once, that every control speaks, and that at least three of them are
SYNTHETIC disagreements. **A hit count moves every time a defect closes** — this sample's
did, twice, within two days — and so does a control built on a live defect. Those four
assertions do not.

`--replay` is the other gate half: it re-grades a saved sample against the current seed and
exits non-zero **only** on `RUNS → not-RUNS`, the repo's standing bar. `→ SILENT` and every
other movement is printed and read, not blocked on. Validated by sabotage on 2026-09-03: a
baseline doctored to claim one refusing cell had been `RUNS` exits 1 and names it.
