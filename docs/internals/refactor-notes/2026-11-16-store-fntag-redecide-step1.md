# One storage decider, step 1: the check-readable late branches, 2026-11-16

Lane STORE (`l2-inferred-interfaces-design.md` §10; census in
`2026-11-15-g81-fn-tag-redecide-census.md`). The goal is that `fnTagDecide` (the check) is the only
storage decision and `fnTagRedecide` (after the elaboration) goes. This step removes the late-only
gate from every `ftLate` branch whose fact the check can already read.

## Method

- A scratch probe seed (never refreshed into `build/`) records, after `elabPrepare`'s rounds, the
  number of sets the check tagged and how many the late rounds added and dropped
  (`$VL_IFACES`, one `ftlate` line per build).
- Population: every `tests/cases` file marked `@run`, 6,472 programs, at master `26f7a8fb`.
- A/B: each program built and run with the fixpoint master seed and the candidate fixpoint seed;
  wasm compared byte for byte, run output and exit code compared.

## Baseline

415 programs end with a different tag decision from the check's (413 gain a set, 2 lose one). The
census at `4b8e8d26` counted 416 of 6,463.

## The five syntactic `ftLate` gates, opened one at a time

| gate | programs whose late flip changes | wasm movers |
|---|---|---|
| `ftCalleeSource`: callee through local `const` aliases | 0 | 0 |
| `ftCalleeFn`: a nested declaration as callee | 0 | 0 |
| `ftHoleParamOf`: `ftOwnTyParamJoins` | 0 | 0 |
| `ftHandBackAtClosed` | 0 | 0 |
| `ftHandedHolder`: an inner list or record literal handed to a hole parameter | 6 | 1 |

- The first four are inert at check time: what they accept beyond the check's own branches comes
  through a per-instance fact (`mintRetParamsOf` in `ftOwnTyParamJoins` and `ftHandBackArg`, the
  mint rows behind `ftHoleParamOf`'s callers), which is empty at check time. Opening them is this
  step: 0 wasm movers, 0 output movers, the census unchanged at 415.
- `ftHandedHolder` is not taken. It closes 1 program and shrinks 4, but makes the check tag one set
  the late decision refutes (`closures/hole-fn-list-unbound-and-returned.vl`; minimal witness
  `keep([inc6])[0](7)` with `keep(xs) { return xs.filter(pos) }`). The late refusal comes from
  `mintSetPartial`, an instance fact, so this gate belongs with the instance-fact classes.

## What is left

Every remaining late flip needs a fact only the elaboration writes (`check_mint.vl`): the 387-program
mint-row class, the hand-back and arm-instancing sites of the 32-program class, `mintSetPartial`,
`mintCloRows`, forwarded fields. Deciding them in the check needs those facts at check time.
