# Capability probes — the gaps the corpus cannot see

`scripts/goal-scoreboard.vl` measures the standing goal against the distilled corpus. The
corpus is generated over a fixed set of axes, so **it can only score a gap it has a program
for**, and `runs` can climb to 100% while a capability refusal stands untouched. Measured
2026-08-30: **9 of the compiler's 14 capability message literals are reached by no corpus cell
at all.**

This directory is the answer to that. One `.vl` per gap, each a program the type system accepts
and codegen refuses. Every probe here **must eventually run**; until it does it is a standing
clause-2 violation with a name.

    scripts/vl-host/target/release/vl run scripts/capability-probes.vl \
        --compiler build/vl-compiler.wasm --        # the gate rows run this

It replaced `run.py` and prints its report byte for byte; the beside-run is pinned as
goldens in `tests/vl_capability_probes_port_test.ts`.

Exit 0 when every probe runs and prints what its header says. Non-zero names the ones that
still refuse — which today is the point of the directory, so **it is not a merge gate.** It is
the thing you re-run to find out whether a fix moved anything the corpus was blind to.

## THE 2026-09-02 AUDIT: most of the remaining literals are FLOORS, not gaps

`--sites` reported **22** capability literals, every one reached by no corpus cell, and the
temptation is to read that as 22 open gaps. It is not: D964's own note says the true site count
sits in `[23, 405]` and **only a WITNESS settles which are reachable**. So fourteen were
witnessed, one plainest-program each.

**Thirteen of the fourteen already RUN** — the literal is live in the source and no
`vl check`-clean program reaches it:

| site | witness | verdict |
| --- | --- | --- |
| `typecheck.vl:18061` structural width subtyping | `Wide` into `Narrow` | RUNS |
| `typecheck.vl:18028` element-converting copy | `i32[]` into `f64[]` | RUNS |
| `typecheck.vl:25622` inferred union return | an `if`/tail union body | RUNS |
| `typecheck.vl:27854` `print` of a union value | `print(v)` over `i32 \| string` | RUNS |
| `typecheck.vl:16151` `==` with no lowering | struct `==` struct | RUNS |
| `wasmEmit.vl:23671/23753/23896` `??` over `string \| null` | union, call result, field | RUNS |
| `wasmEmit.vl:5699` `==` over a struct union | `mk() == mk()` | RUNS |
| `wasmEmit.vl:5959` union `==`, non-binding operand | same | RUNS |
| `wasmEmit.vl:6111` literal `is`, non-binding operand | `mk() is A` | RUNS |
| `wasmEmit.vl:22385` struct equality | two-field struct `==` | RUNS |
| `wasmEmit.vl:23088` `__array_new__` fill | `__array_new__(2, 1.5)` | RUNS |

**One was live**, and it is the one this directory now has a probe for:
`inferred-union-return-hole-param.vl` — `typecheck.vl:20084`, an inferred union return passed
to an un-annotated parameter, which refused while the annotated twin ran. Fixed the same day.

**What to take from the shape of that table.** A `--sites` count is a lower bound on SITES and
says nothing about reachability, so a falling count is not progress and a flat one is not
stagnation — the number stayed at 22 across the fix, because the literal is still in the source
and still correct as a floor. Six of the twenty-two live in `typecheck.vl`, the direction
CLAUDE.md warns hides, and five of those six turned out to be floors: the warning is right
that a gap can hide there, and wrong as a presumption that one does. **Probe before
scheduling.**

## The position matrix — `capability-matrix.vl`, one template, every position, both faces

A capability is enforced in ONE place and served in MANY, so a fix is graded at every
delivery position in the ANNOTATED and UN-ANNOTATED face. Hand-writing those ~40 programs is
where the misses come from — D965 lost global assignment, D1193 was silent at seven of nine,
D1197 is red at exactly one. Write the template instead, and run from the checkout root:

    vl run scripts/capability-matrix.vl -- scripts/capability-probes/matrix/orerr-generic-pin.matrix.vl
    vl run scripts/capability-matrix.vl -- <t> --before old.wasm --after new.wasm
    vl run scripts/capability-matrix.vl -- <t> --only array_push,global_assign --keep

The script lives beside this directory rather than in it because every flat `.vl` here is
a probe. `--list-positions` prints the positions and what each face annotates.

### Template format

A `matrix/*.matrix.vl` is sections, each opened by a `// @@NAME@@` line. Text before the
first marker is a free header.

    @@PRELUDE@@   type/function declarations the value needs (module scope)
    @@VALUE@@     the expression under test, e.g. `orErr(5, false)`          [required]
    @@TYPE@@      its type spelling for the annotated face, e.g. `i32 | "err"`  [required]
    @@WANT@@      what the proof must print (the `Should print` contract)    [required]
    @@PROOF@@     statements over the bound name `v`, printing WANT
    @@TEST@@ @@HIT@@ @@MISS@@   a boolean over `v` plus its two branches; PROOF defaults to
                  `if TEST { HIT } else { MISS }`, and these UNLOCK the six discrimination
                  positions AND the three `*_place` ones, which re-read the delivery place
                  instead of `v` (a template with no TEST skips them, with the reason printed)
    @@SETUP@@     statements emitted in the delivery's own scope before it
    @@GUARD@@     a boolean; the delivery nests inside `if GUARD { ... }` (a NARROWED value)
    @@FALLBACK@@  an expression of TYPE for the paths a GUARD leaves un-taken
    @@SKIP@@      `position: reason` lines
    @@VALUE2@@ @@TYPE2@@ @@PROOF2@@ @@WANT2@@   a second instance, for `two_instances`

**The `block_*` six were added for D1244**, whose shape — a closure capturing a ref local
declared in a MODULE-SCOPE block — none of the original twenty could reach, so
`closure_capture` graded that capability green while the row was live. They deliver inside a
module-scope `if true`, a one-iteration `while`, and a bare `{ }`, each with a capture and a
plain-read variant. Every template is now red at `block_bare` (D1253's floor: a bare block is
`unsupported statement in body` at every scope) and at `block_*_capture` for any ref rep, so
those cells are D1244/D1253 speaking, not the template's own capability — read them as the
harness reporting two standing rows rather than as a finding about the value under test.

Grading is `scripts/lib/probe-grade.vl`'s, the same vocabulary as the probe runner: RUNS /
WRONG / check refuses / emit refuses / SILENT / COMPILER TRAP / TRAP (program) / TIMEOUT. A
trap is COMPILER TRAP only when the host says the compiler module trapped (exit 70, or its
`the compiler itself trapped` banner); a check-clean program that traps when run is TRAP
(program), clause 1. It exits non-zero on `runs -> not-runs` between two seeds or any `SILENT`
or `TRAP (program)` cell after, so **a brief runs it before the
fix and after it** and pastes both tables. `--keep` leaves the cells, which is how a red one
becomes a probe here. A template is a fragment collection, not a program: `lint-self.sh`
prunes `matrix/` from its fmt sweep, and the probe runner's count is untouched because it
never descends into it.

## Adding one

A probe earns its place by being reached by NO corpus cell. Check before adding:

    vl run scripts/goal-scoreboard.vl -- --sites | grep ZERO

Write the smallest program that reaches the refusal, put the expected output in a header
comment, and name the file after the capability rather than after a row id — rows close, and
the gap outlives the row that happened to name it.

## Why not just add these to the census

Because the census is a DISCOVERY instrument at ~35 minutes and re-distilling after it is a
separate step. A gap found today should be measurable today. If a probe's family turns out to
be large enough to deserve an axis, that is a good reason to add the axis and re-distil — but
the probe stays either way, because a distilled representative can be collapsed away and a
named file cannot.

## `live-sites.json` — the witness-backed count, beside the wording one

`goal-scoreboard.vl` has always counted the refusal literals whose SENTENCE concedes the
refused program was legal. **A refusal is not obliged to concede.** `emitProgram:
fromCodePoints argument must be a named i32[] binding` fired on a `vl check`-clean program
the whole time and matched no phrase, and #2665 closed it without the count moving by one in
either direction. Re-derived 2026-09-05: **517 of the compiler's 533 emit-side refusal sites
(97%) say nothing about legality**, so the wording count is a floor and nothing more.

`live-sites.json` is the other count: refusal literals a WITNESS reaches. One row per
literal, each naming a probe in this directory that reaches it, and the scoreboard prints
both numbers with the wording one labelled as the lower bound it is.

    vl run scripts/capability-probes.vl -- --live-sites # re-grade every row
    deno test -A --no-check tests/vl_live_sites_test.ts     # the structural half, in ms

**It is a ratchet in one direction.** A row may only be ADDED with a probe that reaches its
literal — the test refuses a row whose probe does not exist or whose header does not quote
the literal. A row comes OFF when its witness starts RUNNING, in the PR that closed the gap;
`--live-sites` reds until it does, and also on a witness that drifted onto another message or
a literal that has left `compiler/*.vl`.

`vl run scripts/emit-refusal-sites.vl` re-derives the population the list is a subset of:
sites, templates, and which ones the wording predicate misses, grouped by the verb they reach
for. `docs/internals/emit-refusal-wording-2026-09.md` is the measurement that built the list.
