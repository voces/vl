# The niche cast at the instance's type — 2026-11-14

Lane L, PR-3 of the `is`/`match`/`as` family: D2719, and D4031, the same mechanism, which the gate's filed witnesses found moved.

## What moved

- **The witness.** D2719's repro read `w.size`, which a `Set` does not have, so it failed past
  the cast; it reads `w.length`, which reaches the cast's emit refusal on master.
- **The cast.** `emitAsNulNiche` (wasmEmit.vl) read the operand's type as the template typed
  it, `T | null`, whose `T` has no rep, so it took the value-niche refusal. It reads the type
  at the instance (`nodeTyAt(obj, fnIx)`), where `T` pinned to a `Set`, a list or a record makes
  `| null` a nullable reference with a null to test.

## Evidence

- Fixture `tests/cases/generics/as-cast-over-pinned-nullable-param-runs.vl`: `as?` at a `Set`
  pin and `null`, `as!` at a list pin, `as?` at a record pin and `null`, distinct values.
- Seed fixpoint; `gate.sh` on the merged tree.
- Net compiler lines 0 (two reads changed); emit_mono.vl unchanged at 908.

## Residue

D16323: a pin the target can never fit (`size<string>`) is refused at the pin's re-ask rather
than answering `null`; the same on master.
