# Stray nested instances in the elaboration (2026-11-07)

#6732 found `mk<i32>` in `generics/hole-lambda-calls-per-instance.vl` holding its lambda `c` at
`i32` and at `string`. #6707 keyed 55 nested instances under its argument-keyed instances and never
paired them with what mono builds. This note measures both and fixes the cause.

## Measured

Probe rows (`$VL_ID_SHADOW=1`) list each nested instance (one whose parent is an instance) and
each lambda clone mono makes (`monoLamCloneTmpl`, with `elabWalkTop()` and `monoBakeSpecK`). Mono's
lambda instance demands (`elabDemand`'s key) are listed too. Population: the 23,613 sweep programs,
master `3f2fdf80`.

| | base | fixed |
|---|---|---|
| nested instances | 943 (281 programs) | 927 |
| of them under an argument-keyed instance | 55 (17 programs) | 53 |
| mono lambda clones | 2,693 | 2,693 |

**The 55.** 24 pair exactly with a clone mono makes in its `@name` instance: same declaration,
mono's walk top is the instance's base, `monoBakeSpecK` is the instance, and the pins agree. The
other 31 match no clone, because mono shares those lambdas (no template) and does not demand them.
2 of the 31 are strays, both in D12235.

**Strays: 16, in 4 programs.** Here a stray is an instance that the fixed elaboration no longer
mints. The fix mints 0 new instances. Mono's clones change only in binding order, and in the extra
lambda pins described below.

| program | strays |
|---|---|
| `inventory/D12235` | 8 (6 under plain instances, 2 under argument-keyed ones) |
| `generics/hole-call-generic-lambda-arg.vl` | 4 (`viaT`, `viaH`: `(n) => n` at both pins) |
| `generics/hole-lambda-calls-per-instance.vl` | 2 (`mk`'s `c`) |
| `inventory/D2854` | 2 (`mk` again) |

Mint path does not identify a stray. In the base, the encloser's own walk reaches the stray (an
own hole row hits its key), because the stray was already there to be reached. Only 2 of the
16 look stray by mint path. The other 111 instances that pair with no mono build are minted by
their encloser's own walk, at its own call. They are the elaboration's per-instance typing of a
lambda that mono shares, so they are not strays.

## Mechanism

`elabDrainHoleRows` defers a hole lambda's template-check rows (`from < 0`) and replays each
under every instance of its encloser. The D15112 guard skips an instance whose own walk banked
a row for the lambda (`elabOwnHoleRows`). But the deferred loop reached each encloser instance in
the drain right after the instance was minted, before `elabSettle` had walked it, so the guard
never fired. Every instance took every template row: `mk<i32>` and `mk<string>` each took `c` at
`i32` and `string`.

**Fix:** a lambda's template row waits in a per-row pending list until the instance's walk has
finished (`elabWalkedKeys`, set by `elabOne`). Only then does the guard decide.

## Readers the strays had

- `elabLamPinsUnderWalk` requires exactly one kid. With the stray it declined, and mono's clone
  went without the lambda's own pins. Now `mk`'s clone binds `?#L4.0` too. The module bytes are
  unchanged.
- D12235's `emitCaptureRead` refusal: with two kids of `g` under each instance of the outer
  lambda, the env build looked `n` up in the wrong frame. It now runs and prints `6 3`.

## Proof

- Fixpoint seeds on both sides (b2 = b3, f2 = f3). The sweep diff is 23,612 same, 0 bytes-only, 0
  `runs → not-runs` and 0 new traps. One output mover, D12235 emit reject → runs. One new case,
  `closures/hole-lambda-capture-in-two-encloser-instances.vl`.
- Seed: 6,487,939 → 6,489,305 bytes (+1,366, +0.02%).
- Check fuel (`VL_FUEL=1 vl check`):

| program | base | fixed |
|---|---|---|
| `inventory/D12235` | 8,744,976 | 7,938,079 (−9.2%) |
| `generics/hole-lambda-calls-per-instance.vl` | 15,172,745 | 15,174,215 (flat) |
| `generics/hole-call-generic-lambda-arg.vl` | 37,073,526 | 39,494,742 (+6.5%) |
| `compiler/entry.vl` | 60,380,857,682 | 60,380,857,709 (flat) |

The first version re-scanned every encloser instance on each drain and cost +42% on
`hole-call-generic-lambda-arg`. A pending list held in arrays brings that to +6.5%. The profile
puts the rest in the walk's node-type reads (`elabNodeTyAt`, `scopeTyAt`, `elabTyClosedOwn`). It
is not traced further.
