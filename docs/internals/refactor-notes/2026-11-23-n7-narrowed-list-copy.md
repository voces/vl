# D17086: a union box narrowed to `L[] | null` reads as that nullable list (2026-11-23, lane IR-N7)

A legacy soundness fix, express. No IR change: the IR's `narrowed read` already refused the read,
and its niche arm still misses the new list kinds (`narrowed read niche kind`) until a lane builds
it at legacy's niche tail.

| Mechanism | Change |
|---|---|
| list niche read | `nicheReadKindAt` returns a value-atom list's box tag for a read narrowed to `L[] \| null` (`nulListBoxTagOf`); `readRepKinds` reads it at the nullable list its type reps as; `emitNicheReadTail` writes the list's `ref.null` on the null tag, else the payload cast to its wrapper (`listWrapHeapOfKind`) |

Measured in the READY: the pin's rows before and after, the tests/cases A/B moved list, and the
full battery.

## Legacy tails the IR calls

None new.
