# IR behavioural parity: the oracle for Q57 and for after I8 (2026-11-24, lane IR-P1)

Until now the IR has been proved only by byte identity with legacy (`scripts/ir-identity.sh`).
Q57 (coordinator ruling) lets a lane diverge when matching legacy would cost more than about two
hours, and after the I8 cutover byte identity is dropped. Both need a proof that does not depend
on bytes. This lane adds it.

## What landed

- `vl run scripts/ir-parity.vl`. It builds each program twice from one tree: with the seed (IR on)
  and with its `CLAIMED`-empty twin (IR off, the same toggle `ir-identity.sh --cases` uses, now
  `--build-claimless`). It then runs both modules with `vl run` (stdin null, no arguments: no
  program in the three populations takes either) and compares the exit code, stdout, and how the
  run failed. A trap is compared by its `wasm trap:` kind. An invalid module, or any other host
  error, is compared by its message with offsets and indices erased (`census-grade.vl`'s `norm`),
  since a divergence legitimately renumbers functions. Builds are time-boxed at 60 s and runs at
  30 s, as in the identity script. Each captured stream is capped at 1 MiB: a runaway loop's
  output (2 GB in the control below) killed the worker before the cap existed.
- Verdicts are one row per program, `program\tverdict\tdetail`: `same`, `differs`,
  `build-fails(both|on|off)`, `timeout(build|run side)`. Byte-identical modules are `same` and are
  not run unless `--run-all`.
- `scripts/ir-divergence-baseline.txt`, `program\tfunction\tmechanism\tPR`, empty. `ir-identity.sh`
  passes a listed program's byte differ as `expected divergence` only when every function whose
  body differs (`--names` rebuilds, `wasm-dis`, one function per line) is listed for it.
  Parity reds on a byte differ that is not listed, and `--behaviour-only` drops that check for after
  I8. Three controls in `tests/vl_ir_identity_compare_test.ts` cover the subtraction: listed,
  unlisted function, unlisted program.

## Measured (4-core box, `JOBS=4`, seed of 49a2a3c2's tree)

| run | programs | same | differs | build-fails(both) | one-sided | wall | CPU-s |
| --- | --- | --- | --- | --- | --- | --- | --- |
| master, default | 20,125 | 16,790 | 0 | 3,335 | 0 | 406 s | 1,412 |
| master, `--run-all` | 20,125 | 16,788 | 0 | 3,335 | 0 | 556 s | 2,052 |
| control, probes | 282 | 227 | 53 | 1 | 0 | 35 s | 47 |

`--run-all` ran every byte-identical pair on both sides, so it is the run path's own determinism check. The modules agreed on 150 traps (92 `unreachable`, 33 array out of bounds, 9 memory out of bounds) and on every exit code and stdout. The only other rows are 2 `timeout(run both)`: `tests/cases/lint/unconditional-recursion*.vl`, check-only cases that recurse forever by design. As in `ir-identity.sh`, a timeout is refused (exit 3), never passed.

By population (master): distilled 12,304 (9,037 same, 3,267 fail under both), `tests/cases` 7,539
(7,472 same, 67 fail under both), probes 282 (281 same, 1 fail under both).

The failing control is a scratch worktree, never committed, in which `primOp` (`ir_lower.vl`)
lowers an i32 `add` as `i32.sub` (opcode 107). It was built by the pristine seed and run against
the master claimless compiler with `--pop probes`. 53 programs `differ`, for example
`array-new-default-operand-hole.vl  stdout line 1: -1 vs 1`, and the run exits 1. A further 52
build to different bytes but print the same. With the baseline empty those 52 are `unlisted
divergence`, and they red as well.

## Gate row: none

The full run costs about 1,400 CPU-s, more than the whole gate's budget (about 1,100). Most of it
is builds: two per program, the same builds `ir-identity.sh --cases` already pays for after the
gate. The cases-and-probes subset (about 7,800 programs) would cost about as much as `--cases`,
which is about four minutes. On master every pair is byte-identical, so a parity row would run
nothing that `--cases` does not already prove. Parity is the proof a Q57 READY quotes
(`merge-queue.md` §A chosen divergence). Once I8 drops byte identity, it is the natural successor
to `ir-identity.sh --cases` in the queue's post-gate step, not an extra row.
