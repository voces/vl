# A hole lambda's unset parameter takes its argument at the key's slot (lane CENSUS, 2026-11-26)

**Mechanism.** A top-level hole lambda (`const f = (w) => w == "a"`) is called through its closure,
whose rep leaves the parameter `unsup` (no type fixes it). `closureCallAt` compared the argument's
rep with that `unsup` parameter and refused (`closure argument box`). Legacy writes the argument on
its arm at the call key's slot as it stands. `holeSlotTakes` accepts exactly that where the
parameter is `unsup`: an atom's `i32` id at an `i32` slot, a box at a `union` slot.

**Reading** (census probe on master 8d4ea9488's fixpoint seed; class programs only, regen-10 — 6
programs, all `@start`: 4 cases and 2 witnesses):

| | before | after |
|---|--:|--:|
| programs with the unit | 6 | 0 |
| of those, claimed under `VL_IR_REQUIRE_CLAIM=1` | 0 | 5 |

The sixth (`literal-unions/hole-litunion-arith-base-scalar.vl`) moves to `operand type`. Each prints
what master's seed prints.
