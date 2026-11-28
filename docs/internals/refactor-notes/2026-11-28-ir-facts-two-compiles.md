# Whole-program IR facts: an optimised build compiles twice

Step 2's passes (effect summaries, DCE, the inliner, bounds-check elimination) read facts about
every function before any function is lowered: the call graph, def-use, effect summaries. The
claim seam builds and lowers one function at a time, in `fnStmts` order, so no function's
lowering can see a fact about a later one. This note records how the facts are gathered, and
why the first design was dropped.

## The design: two compiles from one reset

`compileSrc` (compiler/driver.vl) runs `compileTwice` when the build is optimised
(`gOptimized`) and something wants the facts (`setIrFactsTwice`):

- **Compile 1** runs the whole pipeline with `irFactsBegin` open. Each claim records its outcome
  by `fnStmts` slot: the node count of the IR it lowered, or -1 for a fallback. Its output is
  dropped.
- **Compile 2** starts from `pipelineReset`, the same reset every compile and check already opens
  with, and is the build. Each claim's outcome must equal compile 1's (`factsAgree`); a
  difference is an internal compiler error, because a fact compile 1 gathered would then describe
  IR compile 2 does not build.

The facts are keyed by `fnStmts` slot and declaration node, which the reset rebuilds
deterministically, never by an index into an arena the reset clears.

Correctness reduces to one sentence: compile 2 is today's compile. `tests/vl_ir_facts_twice_test.ts`
holds it, so the gate proves it on every change:

- two -O compiles in one instance emit identical bytes;
- the twice-compiled -O build emits what one compile does.

The test was checked against a failing control: with the outcome check off by one, it fails on
every program.

**Scope.** Nothing reads the facts yet, so `setIrFactsTwice` is off by default and a build
compiles once. The first pass that reads them turns it on for the builds it serves, and owns the
cost in its own PR, including the plumb-shape baseline (`plumb-shape-cost.vl` builds at `-O` and
gates guest fuel at +5%). Plain builds never compile twice.

## Cost

Measured with `$VL_FUEL=1`, master's fixpoint seed against this branch's:

| program | -O, once | -O, twice | peak RSS once → twice |
|---|---|---|---|
| compiler/entry.vl (self-compile) | 114.909 G | 227.528 G (1.98×) | 4,172 → 4,172 MB |
| capture-union-closure-write-member-grid | 403.7 M | 799.2 M (1.98×) | 200 → 214 MB |

Peak RSS is the larger compile's, not the sum: the reset frees what compile 1 held. With the
switch off, this branch's self-compile fuel is master's within 0.0004%, plain and -O alike.

At -O, wasm-opt dominates wall time: on the self-compile, 65 s of a 462 s build is the guest. So
the second guest compile costs about 2× guest fuel but about +14% wall time on the self-compile,
+10% on the mid-size program, and +5% on a small kernel. No gated measurement except
plumb-shape builds at -O; the L2 self-compile is plain.

## The design dropped: phase A in one compile (A2)

The first design ran a phase A inside one compile, ahead of the code section. Phase A laid out
each function's frame, built its IR inside a claim scope that is always rolled back, and recorded
facts. The claims then lowered as before. It was meant to leave no trace, so an empty pass list
would emit cmp-identical bytes. A no-trace assertion compared four marks at phase A's open and
close: atoms, rep nodes, synthetic globals and list rows.

An -O sweep of 5,168 corpus programs (master's fixpoint against phase A's, same host) refuted it:

| result | programs |
|---|---|
| byte-identical | 4,331 |
| fail on both | 626 |
| the no-trace assertion fired: list rows | 203 |
| bytes differ, no mark moved | 8 |

- **List rows.** Some fired in phase A's frame layout itself: `buildLocals` and scratch
  detection intern list rows. Others fired in a build that interns a row on read (e.g. `useIt` in
  `closures/closure-array-toplevel-union-arm-call`); there phase A missed and the later claim built.
- **The silent eight.** In `arrays/filter-struct-array`, the -O type section is permuted: the
  same 13 types in another order, the same 798 bytes, with no mark moved. Some order-sensitive
  table outside the four marks moves.

Rolling back list rows would cover the first; the second shows the emitter's order-sensitive
interning is wider than any list of marks can be shown to be. Every future interning table would
be a silent hazard for phase A. Two compiles from the existing reset need no such list
(coordinator ruling, 2026-11-28).
