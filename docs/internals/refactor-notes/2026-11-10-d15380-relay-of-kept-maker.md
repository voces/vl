# A `??` default relaying a kept maker's call is refused at its own type, 2026-11-10

D15380 closes as the owed check reject. D15653 is filed for the `if`/`match` join spelling,
which is still invalid wasm.

**The gap.** `const dA: J = mk2()` keeps `mk2` at `J`, and `m.get("z") ?? mk2()` was already
refused at its own type (`recKeptConflicts`). `?? mk4()`, where `mk4` hands back `mk2()`, was not
refused: the delivery's origin is `mk4`, and `mk4` is not kept. So `mk4` was emitted returning
`{f: i32}` while `mk2` returned `J`, and the module was invalid.

**The change.**

- check_fit_rules.vl:
  - `recHandOnMakerOf` follows a maker whose every value is another maker's call, to any depth.
  - `recCoalLandsAt` says whether a `??` default lands at its left read's build.
- check_program.vl: `recKeptConflicts` collects the own-storage deliveries of such a relay of a
  kept maker. Once the containers are built (`recStoresAgree`), it refuses each one that does not
  land at the maker's record. D15317's spellings, where the map is built at `J` so the default
  lands there, keep running (distilled `d15317_*`).

**Graded** (master `171a2d4f` → now):

| spelling | master | now |
| --- | --- | --- |
| the repro | invalid wasm | check reject |
| the two-level relay `mk6` | invalid wasm | check reject |
| the map typed `{[string]: {f: i32}}` | invalid wasm | check reject |
| `mk4()` bound, read, or handed to a hole function | runs | runs |
| both arms `mk4()` | runs | runs |
| D15317's fixture `built-map-read-two-defaults-one-maker-runs.vl` | runs | runs |
| the `if` join `if k > 0 { { f: 4 } } else { mk4() }` | invalid wasm | invalid wasm |
| the same join with `mk2()` in the arm | invalid wasm | invalid wasm |

The join's arms are unified without a pending pair, so no delivery is asked: D15653.

**Proof run locally.**
- refresh ×2 (fixpoint)
- distilled regress: 0 runs → not-runs; the one movement is `d15317_d380`, invalid wasm → loud
  check reject
- cases_wasm, inventory refs/rows
- check-filed-witnesses `--strict` on both inventories (4700 as filed)
- scaling shape, probe rollback, fn-ret shadow
- pin-helper, dead-export and render-parse budgets
- rep-fuzz, lint-self, late demands (6)
- seed size (+0.4%)
