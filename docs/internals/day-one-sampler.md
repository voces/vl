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
   complement. ASYMMETRIC where a spelling has no twin (`is` cannot be written for an inline
   arm); that pair is graded on RUNS-ness alone, each side keeping its own expected output.
4. **`fusion`** — `xs.pop() ?? d` against `const v = xs.pop()` then `v ?? d`.
5. **`pinning`** — a concrete call against the same value routed through a generic
   `pass<T>` or an un-annotated hole parameter.
6. **`scope`** — module, function body, `if true` block, and a one-iteration `while`, at
   module and function level.
7. **`scenery`** — the same program with and without a plausible UNRELATED neighbour: an
   `xs.push` (D1401), a `self`-function never called (D1430), an unused higher-order
   declaration (D1100), an unused `type`, an unused import.
8. **`init_vs_assign`** — `const v = e` against `let v = <literal>` then `v = e`. The
   literal pins the `let`'s rep and the assignment is where a differently-repped source
   disagrees with that pin.

Crossed with a **SOURCE** dimension — where the value comes from: a literal, a call, an
index read, a field read, a map read, a `??`. Not interchangeable at the emitter: D1476
needs a projection specifically, and a call initialiser runs.

## What it CANNOT sample

Stated plainly, because a zero from an instrument is only as good as its frame.

* **Anything outside the grammar.** Seventeen value shapes, six sources, nine delivery
  positions, six scopes, five neighbours. No generics with more than one parameter, no
  recursive types, no multi-module programs, no `match`, no operator overloading, no
  `std:json`/`std:buffer`/`std:fs`, no i32/f64 mixed arithmetic, no strings beyond
  `+`/`.length`. Each is a grammar record away, and none is there today.
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

The three **synthetic** ones prove the sampler can still SEE and CLASSIFY a disagreement, and
each rests on a rule the design will always enforce: a type error, a bounds-checked index, an
exact output contract. Nothing can "fix" them into agreeing. The two **agree** controls are
the closed rows, kept as regression pins — which is the right shape for a closed row anyway:
it pins the fix instead of depending on the bug.

Two of them earn their place beyond liveness. `synthetic/trap` is the only control that
exercises the extra `vl build` this script runs to tell a PROGRAM trap from a COMPILER trap,
which is the one piece of grading it adds to `capability-probes/run.py`'s. `synthetic/wrong`
is the only one that would fail if the output contract went back to `run.py`'s SUBSTRING
test, which passes `"2"` against a printed `"12"`.

**There is no synthetic EMIT-refusal control, and that is a statement about the language.**
By CLAUDE.md's standing rule every `loud emit reject` is a clause-2 violation by
construction — `check` returned 0 to reach the emitter, so either the program is legal and
should compile or the CHECKER owed the diagnosis. No emit refusal is therefore a design rule,
and none can be a permanent control. `synthetic/trap` covers what such a control would have
given: a deterministic non-check channel that will still be there next year.

Validated the way any control must be, against a sabotage that MUST fire: changing
`synthetic/wrong`'s expected output so the pair agrees makes the suite print
`synthetic/wrong … NOT SPEAKING` and exit 1, naming the want and the got.
`tests/vl_day_one_sampler_test.ts` runs all five on every gate, and additionally requires at
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

## Running it

`--count` counts PROGRAMS, so it is twice the number of pairs.

    python3 scripts/day-one/sample.py --seed 1 --count 400 --out run.jsonl
    python3 scripts/day-one/sample.py --seed 1 --count 400 --axis named_vs_inline
    python3 scripts/day-one/sample.py --seed 1 --count 400 --exclude hof
    python3 scripts/day-one/minimise.py run.jsonl --both
    python3 scripts/day-one/file_row.py run.jsonl --index 7 --title "…" --write
    python3 scripts/day-one/sample.py --replay run.jsonl
    python3 scripts/day-one/sample.py --report run.jsonl other.jsonl

**The big sample is a DISCOVERY run, not a gate.** What is in the gate is
`tests/vl_day_one_sampler_test.ts`: a fixed-seed 40-program sample plus the five controls,
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
