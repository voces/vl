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
| J0 | **TS-oracle brain** | `compiler/cli.ts`, the `compiler/*.ts` graph, corpus adjudication, `deno check`/`deno lint` | Killing the TWO COMPILERS (ROADMAP Next) |
| J1 | **V8 wasm executor** | `runWasm` in the corpus/selfhost tests; the deno-side golden + emit suites | Folding RUN/CHECK onto the native (wasmtime) tier — F-tiers |
| J2 | **Test harness** | all 52 `tests/*.ts` (`Deno.test`) | `vl test` for behavioral `.vl`; `node --test` for TS-infra tests |
| J3 | **Build/dev scripts** | `deno run scripts/*.ts` | port load-bearing scripts to `.vl`/Node; retire/move dev-only ones |
| J4 | **Bundling** | `lsp` esbuild build, `playground/build.ts` | esbuild-on-Node (deps already node-resolvable) |
| J5 | **Distribution** | `deno compile` (C5, `release.yml`) | H-M2 wasmtime+WASI binary |

The single largest role is **J0** — and it requires *zero Deno-specific work*. When the TS compiler
is deleted, every `deno run compiler/cli.ts` / `deno check compiler/*.ts` / V8-adjudicated corpus
path disappears with it. So the order of operations is: **don't fight Deno where the TS-host kill
already removes it; spend effort only on the genuinely Deno-specific residue (J1–J6).**

---

## Role-by-role detail

### J0 — the TS-oracle brain (rides the TS-host kill; no Deno-specific work)
- `compiler/cli.ts` is the Deno entry point for `vl build/check/run/fmt`; the native `vl`
  (`scripts/vl-host`, wasmtime) already does this with zero Deno.
- The corpus oracle currently adjudicates via the TS compiler under Deno. ROADMAP Next step 0
  flips it to the WASM compiler under Deno (one brain, two engines), and the native tier
  (`ci-native`) already adjudicates under wasmtime.
- `deno check compiler/*.ts` + `deno lint` (CI `ci` job) gate the TS source — they exist exactly as
  long as the TS source does. The `.vl` equivalent is the native checker + `lint.vl` (already
  ported), so nothing new is needed for the VL side.
- **Action:** none beyond the existing "Kill the TS host" front. Track it; don't block it.

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
  `native-golden-check.ts` (CI byte tripwire), `build-binary.ts`/`smoke-binary.ts` (only until J5).
  Port to `.vl` (dogfood) or Node.
- **Dev-only** — `perf.ts`, `perf-runtime.ts`, `perf-compare.ts`, `checker-parity-sweep.ts`. Can
  lag; move to Node last or retire when the TS compiler (their subject) is gone.
- Each script must be audited for `Deno.*` globals (file IO, `Deno.args`, `Deno.run`) when ported.

### J4 — bundling (independent; cleanest early win)
- LSP: `cd lsp && deno task build` (esbuild under Deno). Playground: `playground/build.ts`,
  `serve.ts`, `verify.ts` (esbuild + a dev server under Deno).
- All their deps are already **node-resolvable** (`binaryen`, `vscode-languageserver*`,
  `monaco-editor` — see `package.json`). CI already runs `setup-node` + `npm ci` for the LSP step.
- **Action:** swap to esbuild-on-Node via `npm` scripts. Fully decoupled from compiler work — can
  land first, before anything else in Track J.

### J5 — distribution
- `deno compile` builds the `vl` binary today (DECISIONS "Distribute via `deno compile`",
  ROADMAP C5, `release.yml` matrix over `--target`). It embeds V8 + the TS compiler + binaryen.js.
- Superseded as the *destination* by H-M2 (wasmtime+WASI; `scripts/vl-host` already exists). The
  `deno compile` binary is now explicitly the **interim** distribution — retire it when H-M2's WASI
  driver lands. DECISIONS entry annotated accordingly.

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
