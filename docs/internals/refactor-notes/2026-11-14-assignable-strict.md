# `assignable` refuses a negative type, and a clean compile that asks one fails the oracle, 2026-11-14

Lane J. Step 3 of the sentinel plan in
[`2026-11-14-assignable-negative-sentinel-census.md`](2026-11-14-assignable-negative-sentinel-census.md),
after `RET_PENDING` (#8081), `TY_OPEN` / `assignableOrOpen` (#8085) and the missing-record callers (#8088).

## What changed

- **A distinct open value.** `TY_OPEN` is -3. -1 now means only "no type": a node with no record,
  or an annotation poisoned by an unresolved name. Before this, `assignableOrOpen` accepted any
  -1 component as open, so a component that was missing rather than open passed unseen. The two
  `mkNullableTy(-1)` open-nullable mints (`cnhPinTy`, `letDeclInferredBound`) spell `TY_OPEN`.
- **The guard refuses.** `assignable`'s `if src < 0 || dst < 0 { return true }` is now `false`,
  and it bumps a per-check counter (`asgNegHit`, reset in `tyVarOwnerReset` with the rest of the
  checker state). The counter is exported as `asgNegCount` (classified `uncached` in
  `vl_compile_cache_test.ts`).
- **The gate goes red.** `driveCase` in `tests/support/casesWasmOracle.ts` throws when a case
  compiles with rc 0 and `asgNegCount() > 0`, so every corpus case (all four `cases_wasm_*`
  shards, inside `deno task test`) asserts that a clean compile asks `assignable` nothing negative.
- **Two mints the strict guard found** (each a bare -1 meaning open, met against a real type):
  - `holeMapDemandTy` minted `mkMapTy(TY_OPEN, -1, 0)`; the value is `TY_OPEN` too
    (`maps/map-get-through-unannotated-parameter.vl`, `maps/error-infer-param-map-not-pinned.vl`).
  - `litElemSrcTy` answered the element's missing record (-1) when the literal's element type has
    a hole; an element with no record now takes the literal's element type, hole or not
    (`functions/forwarder-literal-adapts-to-callee-param.vl`: a forwarder's copied `[v]`).

Net compiler lines **+17** (+24 / −7). Pin helpers (`emit_mono.vl` functions): **908 → 908**.

## Evidence

- Fixpoint: a second `refresh-compiler.sh` is `cmp`-identical, before and after merging master.
- **Corpus oracle**, `deno test tests/cases_wasm_*_test.ts`: 7765 passed, 0 failed.
- **Control for the counter** (an `emitFail`-style probe is trusted only once a known trigger fires
  it): a scratch seed with `assignableOrOpen`'s open short-circuit removed. On it 273 of 7,431
  single-file corpus cases count a negative question, and the oracle fails 276 cases with the new
  message. With the short-circuit in place: 0 of 7,434, failing cases included.
- **Distilled corpus**, `regress.vl` on this seed and on the master-tip fixpoint (`b09064cee`):
  byte-identical output, 0 runs → not-runs, 0 → silent. Both print the same six
  `d16363_*` "other movement" cells (invalid wasm → runs), which is a stale baseline on master.
- **`scripts/decl-order-ab.vl`**, this seed and master's: 312 of 5121 cases move, 38 to a clause-1
  outcome, 0 not in the baseline, on both.
- `scripts/gate.sh`: all gates pass.

## What it does not do

A poisoned annotation never reached `assignable` on the corpus or on seven hand probes
(`x: Nope`, `Nope[]`, `Map<string, Nope>`, a `Nope` field, parameter, result and callback
parameter): each is refused at check (rc 2) with a count of 0. So -1 is not split further into
"missing" and "poisoned"; the counter reads both, and only a clean compile is held to zero.
