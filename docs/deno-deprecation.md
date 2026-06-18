# Deno deprecation — inventory & staged removal

**North star:** remove Deno from the project entirely. No `deno test`, `deno run`, `deno compile`,
`deno check`, `deno lint`; no `deno.json` / `deno.lock`; no `denoland/setup-deno` in CI.

**Priority order matters.** The *active* top goal is **killing the two compilers** (ROADMAP Next) —
Deno removal is the destination that goal is on the road to, not a parallel effort. Killing the TS
host deletes Deno's single largest role (the TS-oracle brain) for free; everything in this doc is
the residue that comes off *behind* that front. Don't spend effort fighting Deno where the TS-host
kill already removes it.

**End-state runtimes:** the `vl` brain runs under **wasmtime + WASI** (ROADMAP Track H, H-M2). The
JS/TS tooling that outlives the TS compiler (LSP bundle, playground) runs under **Node**. Behavioral
tests run under **`vl test`** (ROADMAP Next + `docs/test-runner-design.md`); surviving JS-side tests
run under **`node --test`** (or another runner — open decision).

This doc is the inventory behind ROADMAP **Track J**. It exists because "kill Deno" reads like one
task but is six, on different timelines — most of the surface dies as a side effect of work already
in flight, and conflating them hides what is actually blocking.

---

## Why this is not just "delete deno.json"

Deno fills **six distinct roles**. Each is removed by a different front:

| # | Role | What depends on it | Removed by |
|---|------|--------------------|------------|
| J0 | **TS-oracle brain** | ~~the `compiler/*.ts` graph, corpus adjudication~~ → DONE: TS front end DELETED; `deno check`/`deno lint` now cover only the surviving type leaves + JS tooling | — (the TWO COMPILERS are now one) |
| J1 | **V8 wasm executor** | `runWasm` in the corpus/selfhost tests; the deno-side golden + emit suites | Folding RUN/CHECK onto the native (wasmtime) tier — F-tiers |
| J2 | **Test harness** | all 52 `tests/*.ts` (`Deno.test`) | `vl test` for behavioral `.vl`; `node --test` for TS-infra tests |
| J3 | **Build/dev scripts** | `deno run scripts/*.ts` | port load-bearing scripts to `.vl`/Node; retire/move dev-only ones |
| J4 | **Bundling** | `lsp` esbuild build, `playground/build.ts` | esbuild-on-Node (deps already node-resolvable) |
| J5 | **Distribution** | ~~`deno compile`~~ → DONE: native `vl` host, seed embedded (`release.yml`) | — (shipped, H-M2) |

The single largest role is **J0** — and it requires *zero Deno-specific work*. When the TS compiler
is deleted, every `deno check compiler/*.ts` / V8-adjudicated corpus
path disappears with it. So the order of operations is: **don't fight Deno where the TS-host kill
already removes it; spend effort only on the genuinely Deno-specific residue (J1–J6).**

---

## Role-by-role detail

### J0 — the TS-oracle brain — DONE (Deno's biggest role, gone)
- `compiler/cli.ts` (the old Deno entry point for `vl build/check/run/fmt`) is RETIRED — the native
  `vl` (`scripts/vl-host`, wasmtime) is the sole CLI and ships as a self-contained binary with the
  seed embedded, zero Deno.
- The **TS compiler front end is DELETED** (`compiler/*.ts` core graph + `checker-parity-sweep.ts`,
  ~18.3K LOC). The corpus oracle is `cases_wasm_test.ts` (the seed under Deno) + the native
  wasmtime tier (`ci-native`) — one brain, two engines, zero TS. Only the dependency-free type
  leaves `coreTypes.ts`/`diagnostics.ts` remain.
- `deno check compiler/*.ts` + `deno lint` now cover just those leaves + the JS-side tooling; the
  `.vl` compiler is checked by the native checker + `lint.vl` (`lint-self.sh`, `ci-native`).
- **Action:** none — done. What remains under Track J is the genuinely Deno-specific residue
  (J1–J6: the V8 executor, harness, dev scripts, bundling, the teardown).

### J1 — the V8 wasm executor (🟡 in progress as F-tiers)
- Tests execute emitted wasm with `runWasm` (Deno's V8). The native tier runs the *same bytes*
  under wasmtime (`scripts/vl-host`), already gated by `ci-native` (native fixpoint, golden
  byte-tripwire, corpus alignment).
- **Action:** finish F-tiers — delete the `SELFHOST_DENO_RUN`-gated RUN half + 305-file whitelist
  + V8-side golden/emit suites once the native tier is the undisputed runner; fold the deno-side
  CHECK verdicts the same way when the native checker gates message/span parity. After this Deno
  never *executes* wasm — it only *orchestrates* `Deno.test`, which J2 removes.

### J2 — the test harness (the hard core)
All 52 `tests/*.ts` are `Deno.test`. Split by subject:
- **Behavioral `.vl` corpus** — `cases_test.ts`, `cases_wasm_test.ts`, and the `selfhost_*` suites.
  Migrate to native + `*.test.vl` under **`vl test`** (designed: `docs/test-runner-design.md`;
  charted in ROADMAP Next — new behavioral tests switch to `*.test.vl` at `vl test` v1, and the
  directive-corpus conversion waits for the TS-tier teardown). This is the bulk of the harness and
  the main forcing function.
- **TS-infra tests** — LSP (`lsp_*`), playground (`playground_*`), lint-TS (`lint_*`), `format_test`,
  `symbols_test`, `stringify_type_test`, `source_map_test`, etc. These test TS that *outlives* the
  compiler (the LSP server, the bundler). They move to **`node --test`** when their subsystem is
  ported, or ride along under Deno until then.
- **Open decision:** `node --test` vs another runner (vitest/uvu) for the surviving JS-side tests.
  Pick once `vl test` has absorbed the behavioral corpus and the residual TS test count is known.

### J3 — build/dev scripts
`deno run scripts/*.ts`:
- **Load-bearing** — `gen-std.ts` (embeds the `.vl` std into `std/embedded.ts`),
  `native-golden-check.ts` (CI byte tripwire). Port to `.vl` (dogfood) or Node. (The deno
  `build-binary.ts`/`smoke-binary.ts` are RETIRED — release distribution is the native
  `scripts/build-binary.sh`, a thin cargo wrapper, no Deno.)
- **Dev-only** — `checker-parity-sweep.ts` (the LSP TS-vs-wasm divergence inventory). Can lag; move
  to Node last or retire when the TS compiler (its subject) is gone. (The `perf*.ts` benchmarks drove
  the TS `compile()` and were RETIRED — see `CHANGELOG.md`; rebuild against the native binary if a
  perf baseline is wanted again.)
- Each script must be audited for `Deno.*` globals (file IO, `Deno.args`, `Deno.run`) when ported.

### J4 — bundling (independent; cleanest early win)
- LSP: `cd lsp && deno task build` (esbuild under Deno). Playground: `playground/build.ts`,
  `serve.ts`, `verify.ts` (esbuild + a dev server under Deno).
- All their deps are already **node-resolvable** (`binaryen`, `vscode-languageserver*`,
  `monaco-editor` — see `package.json`). CI already runs `setup-node` + `npm ci` for the LSP step.
- **Action:** swap to esbuild-on-Node via `npm` scripts. Fully decoupled from compiler work — can
  land first, before anything else in Track J.

### J5 — distribution — DONE
- The `deno compile` binary (V8 + the TS compiler + binaryen.js) is RETIRED. Distribution is now the
  native Rust `vl` host with the compiler seed embedded (`cargo build --features embed-seed` via
  `scripts/build-binary.sh`) — a single self-contained file per target, no Deno/V8/node/binaryen.
- `release.yml` builds all five targets per-OS (ubuntu for both Linux arches, macOS for both Darwin,
  Windows for win-x64); `compiler/cli.ts` + `scripts/build-binary.ts` + `scripts/smoke-binary.ts` are
  deleted. The DECISIONS "Distribute via `deno compile`" entry is marked RETIRED. (→ `CHANGELOG.md`)

### J6 — final teardown (last)
Once J0–J5 land:
- Delete `deno.json` + `deno.lock`.
- `ci.yml` / `pages.yml`: drop `denoland/setup-deno` and the `~/.cache/deno` cache steps; the
  brain runs under wasmtime (`ci-native` already provisions it), JS tooling under Node.
- Rewrite the AGENTS.md command list off `deno task *` (→ `vl test`, `npm run …`, native `vl`).
- Drop the dual-runtime constraint in AGENTS.md ("no unguarded `Deno`/`process` globals") — the
  compiler core becomes Node-LSP + wasmtime-brain only, no Deno target.

---

## Sequence & dependencies

```
J4 (bundling)            ── independent, anytime ──────────────┐
J0 (TS-oracle brain)     ── rides the TS-host kill ────────────┤
J1 (V8 executor)         ── finishes with F-tiers ─────────────┤
J2 behavioral corpus     ── needs `vl test` (ROADMAP Next) ────┤
J3 load-bearing scripts  ── after the corpus moves ────────────┤
J2 TS-infra tests        ── onto `node --test` ────────────────┤
J5 distribution          ── folds into H-M2 (Track H) ─────────┤
J6 teardown              ── delete deno.json, strip CI ────────┘  (last)
```

**Hard dependencies:** J2-behavioral ⟶ `vl test`; J5 ⟶ H-M2 (the WASI driver). Everything else is
unblocked — J4 especially can land immediately.

**Forcing functions already in place:** the NATIVE-ONLY standing policy (new features never grow a
TS twin) keeps pushing weight onto the native/wasmtime path; `ci-native` already proves the brain
runs deno-free. Track J is mostly *removal bookkeeping behind fronts already moving* plus the two
genuinely new pieces: the `node --test` cutover (J2/J3) and the bundling swap (J4).
