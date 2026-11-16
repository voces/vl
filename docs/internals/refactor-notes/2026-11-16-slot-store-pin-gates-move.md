# Slot store stage 3, writer 1, part 1: mono's pin gate moves into `pin_gates.vl` (lane SLOT, 2026-11-16)

Row [D16768](../inventory/D16768.md); design refactor-notes/2026-11-16-slot-store-stage-3-design.md
§2 (one implementation of each writer's gate, shared by mono and the elaboration).

## What moves

`monoPinMapValues`' gate (`monoOpenMapValTy`, `monoLetWritesClosed`, `monoLetWritesAt`) and the 24
functions it reaches (the write index `monoWritesOf` / `monoLetWritesExtend`, the frame resolution
`monoReadLetFrame` / `monoStoreFrame` / `monoTopFrameOf`, the program-top walk and the body-decl
copies), their 14 tables and `MONO_PROG_DEPTH`, unchanged, from `emit_mono.vl` into
`compiler/pin_gates.vl`, which mono imports. `monomorphize`'s 11 resets of those tables become one
`pinGatesReset()`. Found by brace-matched call closure from the three gate functions; no moved
function is still defined in mono.

No behaviour change. The next PR has the elaboration call the same functions over the program
before mono, fill the side table and bound the classes.

## Readings

Against master `d7a6bf679`, both seeds at their fixpoint on the second refresh.

- `tests/cases`, 8,137 programs with the module entries (exit code, refusal text, wasm bytes): no
  difference.
- Distilled regress: 0 runs → not-runs, 0 → silent (of 260,818 cells); per-cell identical.
- L2 self-compile fuel 94,393,286,280 against master's 94,389,503,604 measured alike (+0.004%).
- Gate: all pass once the two baselines below move.
- Walk-limit: 3 entries move from `emit_mono.vl` (58 → 55) to `pin_gates.vl` (0 → 3); total 545.
- Phase-state census: `pin_gates` is a mono-phase module, so `cross` stays at master's 583;
  `surface` rises by 18 net (`pin_gates.vl` 19, `emit_mono.vl` 224 → 223), the checker symbols the
  moved code imports, which mono still imports for its own code.
- Emitter-state audit: 0 never-cleared module state of 4,799 mutables.
