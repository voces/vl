# Capability probes — the gaps the corpus cannot see

`scripts/goal-scoreboard.py` measures the standing goal against the distilled corpus. The
corpus is generated over a fixed set of axes, so **it can only score a gap it has a program
for**, and `runs` can climb to 100% while a capability refusal stands untouched. Measured
2026-08-30: **9 of the compiler's 14 capability message literals are reached by no corpus cell
at all.**

This directory is the answer to that. One `.vl` per gap, each a program the type system accepts
and codegen refuses. Every probe here **must eventually run**; until it does it is a standing
clause-2 violation with a name.

    python3 scripts/capability-probes/run.py

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

## The position matrix — `matrix.py`, one template, every position, both faces

A capability is enforced in ONE place and served in MANY, so a fix is graded at every
delivery position in the ANNOTATED and UN-ANNOTATED face. Hand-writing those ~40 programs is
where the misses come from — D965 lost global assignment, D1193 was silent at seven of nine,
D1197 is red at exactly one. Write the template instead:

    python3 scripts/capability-probes/matrix.py matrix/orerr-generic-pin.matrix.vl
    python3 scripts/capability-probes/matrix.py <t> --before old.wasm --after new.wasm
    python3 scripts/capability-probes/matrix.py <t> --only array_push,global_assign --keep

A `matrix/*.matrix.vl` is `// @@SECTION@@` blocks: `@@PRELUDE@@`, `@@VALUE@@`, `@@TYPE@@`,
`@@WANT@@`, and either `@@PROOF@@` or `@@TEST@@`/`@@HIT@@`/`@@MISS@@` — the latter also
unlocks the six discrimination positions. `@@SETUP@@`/`@@GUARD@@`/`@@FALLBACK@@` deliver a
NARROWED value; `@@SKIP@@` takes `position: reason`. `matrix.py`'s docstring is the spec and
`--list-positions` prints the twenty and what each face annotates.

Grading is `run.py`'s, imported not copied. It exits non-zero on `runs -> not-runs` between
two seeds or any `SILENT` after, so **a brief runs it before the fix and after it** and
pastes both tables. `--keep` leaves the cells, which is how a red one becomes a probe here.
A template is a fragment collection, not a program: `lint-self.sh` prunes `matrix/` from its
fmt sweep, and `run.py`'s probe count is untouched because it never descends into it.

## Adding one

A probe earns its place by being reached by NO corpus cell. Check before adding:

    python3 scripts/goal-scoreboard.py --sites | grep ZERO

Write the smallest program that reaches the refusal, put the expected output in a header
comment, and name the file after the capability rather than after a row id — rows close, and
the gap outlives the row that happened to name it.

## Why not just add these to the census

Because the census is a DISCOVERY instrument at ~35 minutes and re-distilling after it is a
separate step. A gap found today should be measurable today. If a probe's family turns out to
be large enough to deserve an axis, that is a good reason to add the axis and re-distil — but
the probe stays either way, because a distilled representative can be collapsed away and a
named file cannot.
