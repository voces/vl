# START-2: `for in literal in an unrolled copy` (2026-11-26)

#10277 exposed this class: its two programs moved here once their range loops built. Graded on master 07aac37c with a probe-patched compiler:

| program | before | after |
|---|---|---|
| `loops/unrolled-range-loops.vl` | for in literal in an unrolled copy | fully claimed |
| `loops/jump-from-value-arm.vl` | for in literal in an unrolled copy | `int switch scrutinee` (`denseMatch`, another class) |

The skip only declined, so that the IR would not diverge from legacy's pooled global for a literal of the copy's
constants. With behaviour parity as the bar (#10171), the IR's own build of the literal stands:
`ir-parity --run-all` is byte-identical on both programs and on the new sweep.
