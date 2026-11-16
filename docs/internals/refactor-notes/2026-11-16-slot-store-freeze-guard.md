# Slot store: the place classes are frozen when mono begins (lane SLOT, 2026-11-16)

Row [D16768](../inventory/D16768.md). The classes are built once, at `eplEnsure` before any emit
pass: `EPL.stale` is set only by `eplStaleAt`, whose callers are `elabSlotFacts` (in `elabRun`) and
`elabSlotBundleFacts` (in `elabPrepare`, the end of check). This change makes that a checked
invariant.

## The guard

`eplFreeze()` runs at the `monomorphize` pass. From then on, `eplBuild` or `eplStaleAt` fails the
emit with an internal error ("the place classes were rebuilt after mono began"). `elabRun` clears the
flag for the next program.

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

READINGS
