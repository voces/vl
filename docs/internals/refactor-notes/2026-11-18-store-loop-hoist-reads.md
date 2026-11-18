# The loop prologue's hoisted receivers are the IR's own reads, 2026-11-18 (lane STORE)

The re-entry ranking (`2026-11-18-ir-reentry-ranking.md`) put `loopHoistOpen` second: 934 lines
in 28 drivers the claim path reached only through it. Its prologue read each hoisted list
receiver with legacy's expression writer, two or three times, inside an IR function.

## The step

- **Legacy, bytes unchanged:** the prologue splits into a shared plan (`loopHoistCands`, which
  receivers; `hoistCandRow`, which row), the header tails (`hoistRowReads`, `hoistReadTail`,
  `hoistRowMark`), and legacy's own loop, which reads each receiver with `emitExpr`.
- **IR:** `irLoopHoistOpen` runs the same plan and tails, reading each receiver as its builder
  read it: the variable of a plain name read (`irReadVar`), or a global's read or a plain field
  read off a variable, noted as written again (`irReadAgain`). Any other receiver is a miss,
  not a legacy read.

## Measured (master `7eaffc02`)

| | |
|---|---|
| the 28 drivers behind `loopHoistOpen` | 13 leave the claim path (591 lines): `emitMemSharedRead` 106, `emitIdentNode` 94, `loopHoistOpen` 79, `emitMemStructRead` 77, `emitIdentNonLocalRead` 52, `emitMemVariantRead` 46, `emitMemberNode` 39, `emitUserGlobalGet` 28 and five smaller; 15 stay (343 lines), every one a `decide` row of the hoist's own plan |
| `emitExpr`'s claim-path doors | no `@ir`, no `@re:loopHoistOpen` |
| identity, master's fixpoint → this head's, `--names` | 9,030 identical, 0 differ, self-compile identical |
| `--cases` | 7,446 identical, 0 differ |
| corpus functions covered and matched | 30,510, as master |
| L2 self-compile fuel | 97,182,747,613 against master's 97,094,378,219 on the same base (+0.09%) |
| compiler lines | +167 / −60 |

Before the miss replaced the legacy read, a probe census counted the receivers the claim path
still read with legacy: 2,625 global reads and 252 field reads, no capture or other shape. Both
are now IR reads. No line is deleted yet: legacy's own loops still read through these drivers.
