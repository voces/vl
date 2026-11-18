# Dead-code sweep 1: the write-only module state, 2026-11-18

Lane STORE, interim deletion-only assignment (the B series is paused). The first batch is the one
class that is dead by construction: module state nothing reads. The `unused-state` ratchet
(`scripts/unused-budget-baseline.json`) held nine write-only containers, and all nine are deleted
with their resets and writes:

| module | container |
|---|---|
| `check_mint.vl` | `mintScopeKey` |
| `check_relate_core.vl` | the local `nonNull` in the declared-union fill |
| `check_write_scan.vl` | `cwFrameUp` |
| `cli.vl` | `cliTestSkip` (`cliTestNameCommit` keeps its host ABI as `_skip`) |
| `emit_atom_kinds.vl` | `sfnEmpty` |
| `emit_mono.vl` | `cadSite`, `monoCgcHoleT` (and its parameter), `monoReachStmts`, `monoReachRoots` |

The ratchet's baseline falls to 0 / 0. Net compiler lines: +5 / −34.

## Grades (fixpoint seeds both sides, master `8a0890936`)

- `VL_LATE_DEMANDS=1 vl check --codegen tests`: byte-identical to master's, late rows included.
- @run A/B, 6,726 programs: 0 wasm movers.
- `check-filed-witnesses --strict`: 5,468 graded, 0 MOVED, 3,436 checked, 0 mismatched.
- L2 fuel 96.654G against master's 96.671G measured alike (−0.02%).
- emitter-state-audit, phase-state census, lint-self: clean. `emit_mono.vl` stays at 908.

## The function-coverage instrument, and why it deletes nothing on its own

To find a second batch, the compiler was instrumented at every function entry, loop and return
(binaryen `--log-execution` on a `--names` seed), and `compileSrc` was run over every `.vl`
under `tests/`, `std/`, `scripts/` and `bench/`, plus `compiler/entry.vl` (22,964 programs). 2,944 of
18,860 functions never ran. By module, the bulk is code `compileSrc` does not drive:
- the CLI driver (`driver.vl` 395, `cli.vl` 197);
- lint (372), the formatter (144), LSP queries (`check_query.vl` 159);
- the optimiser (`opt_*`), linking, `iface_hash.vl`.

The compile-path rest is, on inspection, live:
- host-called exports (`setEmitNames`, `elabLateCount`);
- instruments behind an env flag (the shadows, probes, `pinGuard*`);
- `emitFail` refusal helpers (`monoGenericListFail`, `monoHoleTwoPinsFail`). The corpus holds no emit
  reject by design, so a refusal never fires on it, and deleting one turns a loud reject silent.

A function the corpus never runs is a coverage gap or a refusal, not dead code. The static
reachability check (`scripts/dead-exports.vl`) already reads 0. So a later batch needs a deadness
argument per arm (unreachable by construction), not a coverage count.
