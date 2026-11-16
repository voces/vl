# Slot store: the place classes are frozen when mono begins (lane SLOT, 2026-11-16)

Row [D16768](../inventory/D16768.md). `EPL.stale` is set only by `eplStaleAt`, whose callers are
`elabSlotFacts` (in `elabRun`) and `elabSlotBundleFacts` (in `elabPrepare`, the end of check), and
`eplEnsure` builds the classes there only for a program that takes a function as a value. In any
other program the first mono reader that asked built them mid-mono, over the rewritten program: the
first version of this guard failed 748 of the 8,137 `tests/cases` programs on that path.

## The guard

`eplFreeze()` runs at the `monomorphize` pass. Classes still stale there are built, for a program
that takes a function as a value, or frozen empty, for one that takes none (nothing in it is
delivered; `eplTakesFnValue` is scanned once per program). From then on `eplBuild` or `eplStaleAt`
fails the emit with an internal error ("the place classes were rebuilt after mono began").
`elabRun` clears the flag for the next program.

Building at the freeze for every program instead cost +2.5% fuel and +18% peak live heap on the
plumb-shape units; the empty freeze costs nothing measurable, and the 748 programs that built lazily
are byte-identical either way.

## The control

A scratch build that calls `eplStaleAt()` right after the freeze fails the emit with exactly that
message on a program that takes a function as a value. The guarded build runs the same program.

## What it does not prove

It proves the classes are not rebuilt mid-mono. It does not prove that a class reader asked during
mono reads only build-time facts: the read audit found reachable live reads of call arguments and
callees, annotations, raw name resolution and lazily computed bounds, written by `dispatchRewrite`,
`captureBoxRewrite` and mono. Those move to snapshots taken at build or freeze time in a following
change (B′), after a probe measures whether any of them changes an answer.

## Readings

Against master `7e8b71ff6`; both seeds reach their fixpoint on the second refresh.

- `tests/cases`, 8,137 programs with the module entries (exit code, refusal text, wasm bytes): no
  difference.
- Distilled regress: 0 runs → not-runs, 0 → silent (of 260,818 census cells); per-cell output
  identical to master's.
- L2 self-compile fuel 94,838,175,209 against master's 94,842,846,186, measured alike.
- plumb-shape: main 9,465,425,278 against master's 9,465,424,543 fuel, tail 6,860,559,508 against
  6,860,558,773; peak live heap equal.
- Gate: all pass.

- Capability matrix A/B over the 154 templates matching `maker|hole-fn|list-of|fn-record|closure|
  captured|generic-relay`: 0 runs → not-runs and 0 → silent in every template, no REGRESS line.
