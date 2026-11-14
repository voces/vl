## Infrastructure (Track F)

- **Phase products and a session value, designed** (review L5): 544 of 4,876 module-scope tables
  cross a phase, non-checker files import 1,166 checker symbols, and 188 globals are hidden
  arguments (mono's instance builder has 15 beside its 11 parameters). `Session` owns the
  interners and per-module `Parsed`/`Resolved`/`Checked`; an IR function is owned by its instance
  in `Elaborated`. Eight byte-identical steps, starting with an explicit `InstReq` in mono and a
  `FnCtx` in the emitter (about −6,000 to −8,000 lines):
  `docs/internals/refactor-notes/2026-11-14-phase-products-design.md`.
