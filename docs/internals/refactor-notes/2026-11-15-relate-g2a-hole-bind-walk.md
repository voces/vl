# L2 S2 group 2: `holeChoice` needs no row, and the `holeBind` walk owns its state, 2026-11-15

Group 2 of the L2 S2 prerequisites (flow and bindings), after the census in
`2026-11-15-relate-g2-fit-census.md`. For each family the question is which part is the body's
(a row keyed `(decl, param)`, written when the body check closes) and which is the call's (asked at
the call, the solver's at S3). This note answers it for `holeChoice*` and does the first step for
the `holeBind*` instance/forward family.

## 1. `holeChoice*`: no row

From the transitive-read census at master `ee1427a8`:

| part | functions | reads |
|---|---|---|
| body | `holeChoiceArms`, `holeChoiceArmDecl` | `P` (kinds, tokens, `callNever`) and the write-scan memo `cw*`, built once from the arena. No `nodeTyIx`, no `T`, no elaboration table, no `fnSets` |
| call | `holeChoiceJudge`, `holeChoiceWaits`, `holeChoiceArmCstrsAt`, `holeChoiceDisagreeMsg` | the arms judged at a call's closed or widened parameter types: call-dependent, solver at S3 |
| group 1 | `holeSetMembers` (and `holeSetJudge`) | `elabFnSetOf(nodeTyIxOf(call))`, the function sets. Reached from `holeLetReadsOf`, so from `holeChoiceArmsOf`. Handed to lane G |

The body part already answers from syntax alone, so a stored "which arms, which declarations" row
would copy a pure function. No row was written: 0 lines.

## 2. `holeBind*`: six registers become one walk record

`holeBindInsts` walks the hole's owner body, follows forwards into other declarations, and counts
what it saw in six module registers: `holeBindSeen`, `holeBindOpen`, `holeBindSelfSeen`,
`holeBindFollowLit`, `holeBindOnlyCall` and `holeBindLitFollowed`. `holeBindInstance` and
`holeBindCalled` read the counts after the walk returns. `holeLitFwdRet` sets the two modes
around the read.

**The registers re-enter.** A call's typing inside the walk can start another `holeBindInsts`,
which resets the counts the outer read is still accumulating. Measured with a scratch probe over
`tests/fixtures`, `tests/cases` and the distilled `cells/` and `named/` (never pushed):

| event | runs | programs |
|---|---:|---:|
| `holeBindInsts` entered (control) | 15,439 | over 950 |
| entered while another read is open | 84 | 15 |
| `holeBindInstance` read counts an inner read reset | 129 | 15 |

Giving each read its own counts (save and restore around the two readers) changes **0 of 20,478**
program fingerprints. So the clobbering is real, but on the corpus it never changes an answer.

The change: one `HoleBindWalk` record per read, created by each exported entry point
(`holeBindInsts`, `holeBindInstance`, `holeBindCalled`, `holeLitFwdRet`) and passed to the six
private walk functions. A nested read is a read of its own, so `holeBindNoteCall`'s save and
restore of the modes goes. `holeBindHeld`, the re-pointed `let`'s functions set by the caller,
stays an input register.

This is the "hidden registers → arguments" step only. The body part of the walk (the calls through
the hole and the forward edges, keyed by owner and parameter) is the row candidate for the next PR.
One of its reads, the forward through a joined callee value (`elabFnSetOf` in `holeBindForward`),
is group 1.

## Measurements

- Fingerprint (`probe-rollback-census.ts --fingerprint`, 20,478 programs): this tree's fixpoint seed
  is identical to master `ee1427a8`'s.
- `$VL_IFACES=1 vl check --codegen` over the 8,322 files of `tests/cases` and `tests/fixtures`:
  4,740 lines, byte-identical.
- Fixpoint: L1 equals L2.
- Phase-state census: hidden globals in `check_relate_core.vl` 5 → 3 (baseline written).
- Net compiler lines: +34 (92 added, 58 removed). They are the record type, its constructor and two
  `…In` entry points. `emit_mono.vl` functions: 908.
- `GATE_IN_WORKTREE=1 scripts/gate.sh`: all gates pass.
