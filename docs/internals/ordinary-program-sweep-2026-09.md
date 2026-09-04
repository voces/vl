# The ordinary-program sweep — a rate for the population no instrument samples

**Measured 2026-09-03 against master `cdfdc14e`. 70 programs, 62 ran (88.6%).**

Every other instrument in this repo samples a population somebody already delimited. The
capability probes are one hand-written program per ALREADY-KNOWN gap. The distilled corpus is
generated over fixed axes, so it scores only the shapes its generator was told about. The
census is the same generator, wider. **None of them can find a shape nobody has thought of**,
and the only estimate anyone had for that population was a ten-program batch that produced
[D1473](inventory/D1473.md).

This is the second, larger sample. The protocol is the whole method and is deliberately dull:
write a small program a person would write on day one — five to twenty-five lines, doing
something useful, printing an answer — run it, and grade what happens. Not a minimal repro,
not a variation on a filed row, not a compiler test.

## The rate

Counted by re-running all 70 programs against the tree's own seed, not by relaying the three
batches' self-reports:

| outcome | count |
| --- | --- |
| **runs** | **62** |
| loud check reject | 4 |
| loud emit reject | 2 |
| runtime failure (engine or trap) | 2 |
| total written | 70 |

Every one of the 62 that ran printed the arithmetically correct answer; each was hand-checked
against the program's own intent. **No wrong-answer finds in this sample.**

Of the 8 that did not run, **6 are filed compiler defects** ([D1480](inventory/D1480.md),
[D1481](inventory/D1481.md), [D1483](inventory/D1483.md), [D1484](inventory/D1484.md) twice,
[D1485](inventory/D1485.md)), **1 is a std gap** and **1 is a diagnostic-quality complaint about
a legitimate refusal** — both described below and neither a defect. Two further defects
([D1482](inventory/D1482.md), [D1486](inventory/D1486.md)) were found while ABLATING the first
six, not by a program in the sample.

**So: roughly one filed defect per twelve ordinary programs, and the defect rate per program is
about 9%.** For comparison, the same protocol's first ten-program batch found one defect and
its second found none — a rate the two samples agree on to within their own noise.

## What the sample says about SHAPE, not just rate

The three batches were pointed at different themes on purpose, and the finds did not land
where the themes predicted.

**Ordinary data-structure code is solid.** A stack, an index queue, a two-list queue, a
recursive tree walk, grouping into a map of lists, a set-of-seen dedupe, sorting, memoised
recursion, word frequency, string building, 4-field record tables — 34 of 38 ran first time,
and the four that did not are three filed rows plus one author error.

**Inline and anonymous types are solid where a named one is usual.** An inline shape as a
parameter type, a return type, an array element type, a map value type, a struct field and a
generic argument all ran, and the fully-inline spelling of a grade report produced output
byte-identical to its named-type twin. This is worth stating because D1473 — the row this
sweep accompanied — is an inline-type defect, and the natural inference from one such find is
that the whole area is weak. It is not; D1473's coordinate is narrow.

**The finds cluster at BOUNDARIES between two features that each work alone.** A closure
under a top-level `for … in`; a `map`/`filter` result handed to a generic; `.map` asked to
produce a closure; `?.` over a call; a lambda argument at the UFCS spelling; a literal union
in a template hole. Every one is two working things used together — which is the shape a
generated corpus over independent axes is least likely to reach.

**A two-spelling rescue existed for all nine finds**, and in six of them the rescue is what
identified the defect at all: the free-call spelling of a UFCS call, the annotated destination
of an inferred one, the loop wrapped in a function, the receiver bound to a name first. Writing
BOTH spellings of anything that has two is the single highest-yield habit in this protocol.

## NOT defects — labelled, so nobody re-files them

**A missing std function is not a compiler defect.** One program needed to format an `f64` to
two decimals and there is no `floor` / `round` / `trunc` / `toFixed` anywhere in `std/*.vl`,
nor a truncating f64→i32 conversion — `as` is exactness-checked by design (`350.5 as! i32`
traps loudly, `as?` is `null`), and `%` is integer-only with a contract-shaped message. The
hand-rolled `(x * 100.0 + 0.5) as! i32` idiom therefore traps on any product that is not
exactly representable. A user CAN hand-roll a floor with a `while` loop over `(n as f64)` and
it works, but that is not day-one code. **This is a std API question, not a compiler one**, and
it belongs in a `std:` proposal with the review that requires.

**A legitimate refusal with a poor message is not a defect either.** The counter idiom over an
un-annotated `Map()` — `const m = Map()` then `m[k] = (m[k] ?? 0) + 1` — cannot pin its value
type, which is a genuinely circular inference and a defensible refusal. What is wrong is only
the wording: the diagnostic the corpus documents for this situation
(`tests/cases/maps/error-no-annotation.vl`'s `cannot infer a type for 'm'`) never fires, and
the author instead gets `operator '+' is not defined for _ | null and i32`, which names neither
the map nor the fix and leaks the internal hole placeholder `_` into user-facing text. Both
rescues run (annotate the map, or do any plain write first). **File a message change if it is
worth making; do not file a defect.**

**Design surfaces that read as refusals but are contracts**: `%` is integer-only; `?.` reads a
declared struct field and says so; `as` propagates null unless you pick `as!` or `as?`, and the
diagnostic names both at the point of use. Each states a rule, and no neighbouring spelling
contradicts it — which is the test that separates these from [D1485](inventory/D1485.md), where
four neighbouring spellings do.

## How to run this again

Three agents, one theme set each, ~16 programs apiece, each writing into its own directory and
grading against a FROZEN COPY of the seed so a concurrent compiler rebuild cannot move the
answers underneath them. Then re-grade every program yourself before believing any count: the
three batches' self-reported first-grade totals and the re-run totals differed, because a batch
FIXES its own author errors in place and then reports the pre-fix number.

The single instruction that mattered most was the triage rule — an author error, a missing std
function, a design contract and a compiler defect are four different things, and a sweep that
does not separate them reports a rate for none of them.
