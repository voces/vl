# `emitExpr` asks the `null`-unit question only of a read that can be one, 2026-11-10

Hotspot 1 of `2026-11-10-perf-self-build-profile.md`. Base is master `3adeace6` (#7041). Fuel is
`$VL_FUEL=1` guest fuel and RSS is GNU `time`'s `%M`. CPU seconds are not used, because the box
is a shared cloud VM.

`emitExpr` asked `exprIsNulNone` of every `Member`, `Index` and method-call read. Answering it
builds the read's whole `ReadRep`, and on the L2 build that was 7.5% of the samples. A `null`-unit
store is read at type `null`, or at a type open in a type variable. `readMayBeNulUnit`
(wasmEmit.vl) tests the read's checked type first and skips the question for any other read.

| build | fuel before | fuel after | Δ | peak RSS before → after |
| --- | ---: | ---: | ---: | ---: |
| L2 self-compile | 92,200,911,821 | 79,372,330,887 | −13.9% | 4,268 → 4,096 MB (live 956 → 928 MiB) |
| plumb main | 9,082,698,283 | 9,082,803,065 | +0.001% | 320 → 320 MB |
| plumb tail | 6,583,221,426 | 6,583,298,220 | +0.001% | 318 → 318 MB |

The L2 build saves far more than the 7.5% the profile charged to the call: no later classifier
asked for the rep of most of the skipped reads, so they were never memoized. On the plumb units
nearly every read is a scalar local, so the only change there is the one type test per read.

**Output is unchanged.** The seed is a fixpoint: the master seed building this source, and that
compiler building it again, give byte-identical output (6,598,937 bytes). Every one of the 7,686
`tests/cases/**/*.vl` files builds to the same wasm bytes and the same diagnostics and exit code
under the master seed and this one. The instrument was checked against a control: a missing seed
on `tests/cases/arith` gave 9 differences out of 9 files.
