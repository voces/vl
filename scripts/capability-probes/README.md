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
