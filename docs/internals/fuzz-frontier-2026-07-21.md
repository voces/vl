# Fuzz frontier handoff — 2026-07-21

State of the rep-composition fuzz burndown as of master `6f21705`, written for pickup on a
different machine. Everything here reproduces from a seed: `scripts/fuzz-vl.sh --seed S --count 200
--depth D [flags]` regenerates the exact failing case (add `--keep DIR` to keep the `.vl` + `.err`).

## Where things stand

- **Pinned baseline (`scripts/rep-fuzz-baseline.txt`): 1 line** (199 → 1 over 2026-07-19..21).
  The survivor is `REJECT p2r ((i32) => {f: boolean}[] | {w: i32}) | f64` — see §2.
- **All five gate-red soundness findings from the 2026-07-20 nightly (run 29740424202) are fixed**
  with true codegen fixes, each verified against its exact failing seed:
  - `4ec8976` — recursive map value-rep resolution (mv-slot interner reentrancy skew) +
    transitive closure captures (capScan never descended nested FuncDecls).
  - `11a86c0` — internInlineShape keyed code-15 nested fields by inline spelling (REJECT-turned-
    compiler-crash regression from bb5b7be) + un-reserved call_ref spill for a narrowed
    union-array closure element.
  - `27eed81` — litunion alias widened out of TyFunc result renders (sig-key mismatch);
    missing `nulreflist` arm in globalCellKind/fbValtypeNullable/fbRefNullForKind; union-arm
    map pre-pass only walked one member hop.
  - `6f21705` — seedExpected now descends array literals into a union's closure-array arm;
    emitCallRef no longer leaks pending float/i64 coercion flags into argument spines.
- Full gate green locally at `6f21705`: rep-fuzz exact (1 baselined, 0 unsound), native fixpoint
  byte-exact, self-lint clean, `SELFHOST_NATIVE_ALIGN=1 deno task test` 1728/0.
- Verification dispatch on the post-fix compiler: fuzz-nightly run **29801667445** — **RED**, with
  two NEW gating-leg unsound findings (§0). The five previously-failing seeds' shapes did not recur;
  fresh seeds keep finding unsound output at roughly 1 per ~2000 programs, so expect the gate to
  stay red-ish until the frontier families in §3 are burned down.

## 0. Live gate-red findings on CURRENT master (from run 29801667445 — start here)

| Class | Shape | Repro |
|---|---|---|
| INVALID-WASM | `(i32) => (() => K0 \| null)` | `--seed 408087978 --depth 4` (plain) |
| TRAP | `string \| null` (position p3r) | `--seed 796537820 --depth 5` (plain) — confirms the §4 lead; a startlingly small shape |

The same run's report-only branching leg also surfaced (seeds in the run log):
`TRAP ((i32, i32, i32) => K0 | {w: i32} | f64)[]` and `INVALID-WASM (() => f64 | null) | boolean`.

## 1. The nightly's four legs (context for the tables)

The nightly (`.github/workflows/fuzz-nightly.yml`) runs `scripts/fuzz-nightly.sh` four ways:
the **plain leg gates** (any non-baselined INVALID-WASM/TRAP/MISMATCH fails the job), and three
**report-only** legs measure the frontier without gating: `--branching` (multi-element
arrays/maps, two recursive struct fields, arity-3 unions, multi-param closures), `--multiobs`
(oracle also reads decoy siblings/arms), `--declared` (hoists shapes to `type Tn = ...`
declarations; `decl:`/`twin:`/`mix:` markers). Flag key for the tables below: **b** =
`--branching`, **bm** = `--branching --multiobs`, **bmd** = `--branching --multiobs --declared`.
All repros are `--count 200`.

## 2. The last pinned REJECT — a standalone rep project, not a slice

`((i32) => {f: boolean}[] | {w: i32}) | f64` sits behind the #911 anonymous-element-reflist gate
in `refArmUnionRetName`. A layered probe (slice/union-reflist-arms agent, 2026-07-21) found the
full unlock chain: closure-result ref-arm-union `$fnsig` interning → `is`-narrowing over an
*inferred* ref-arm-union closure result → outer value-union box with a closure arm. Extending the
gate one layer just exposes the next reject, and the sibling shape `((i32) => i32[] | boolean) |
f64` **emits invalid wasm today** (verified) — so a partial ungate risks trading a loud REJECT for
a miscompile. Do this as its own project with the repOf descriptor rewrite (ROADMAP "Next"), or
not at all.

## 3. Report-only frontier — unsound shapes (fix or make loudly reject; NEVER baseline)

From run 29740424202 (2026-07-20, master 59fe27a). Wave-1 fixes above may have cleared some —
**re-run each seed before starting work**; anything still failing is live. Shapes involving
`(i32,i32,i32) =>` closures cluster hard and probably share one or two root causes (the pinned
generator never emits multi-param closures, so this path is under-tested).

### MISMATCH (silent wrong answer — highest severity)

| Shape | Repro |
|---|---|
| `{a: f64, f: {a: {a: f64, f: i32 \| null, z: i64} \| null, f: {a: i64, f: () => {f: string}, z: {[string]: {f: K0}}}, z: {f: {a: (i32, i32, i32) => string, f: {a: f32, f: f64, z: i32}, z: boolean}}}, z: string}` | `--seed 42931513 --depth 5` b |

### TRAP

| Shape | Repro |
|---|---|
| `{a: {a: f64, f: {[string]: f32} \| null, z: i32}, f: {f: i32}, z: {f: K0}}` | `--seed 152244933 --depth 6` bm |
| `(() => {f: K0} \| null) \| null` | `--seed 679748579 --depth 5` bm |
| `twin:{a: string, f: () => {a: {[string]: string}, f: {f: boolean}, z: {f: i32}}, z: i32}` | `--seed 318743446 --depth 6` bmd |
| `mix:{f: {[string]: {f: string}} \| null}` | `--seed 43909430 --depth 4` bmd |

### INVALID-WASM — multi-param-closure cluster (likely 1–2 shared root causes)

| Shape | Repro |
|---|---|
| `(i32, i32, i32) => {a: boolean, f: {f: K0}, z: string} \| i32` | `--seed 383761456 --depth 5` bmd |
| `(i32, i32, i32) => {a: f32, f: i64, z: boolean}[] \| i32` | `--seed 615401451 --depth 6` b |
| `(i32, i32, i32) => {f: i64[] \| null}` | `--seed 70441494 --depth 4` b |
| `((i32, i32, i32) => boolean[] \| boolean) \| boolean` | `--seed 318743446 --depth 6` bmd |
| `((i32, i32, i32) => ((i32, i32, i32) => i32 \| null)[] \| boolean) \| null` | `--seed 318743446 --depth 6` bmd |
| `() => {a: (i32, i32, i32) => string, f: i64, z: {[string]: i32}}` | `--seed 42931513 --depth 5` b |
| `() => {a: {[string]: K0}, f: (i32, i32, i32) => f32, z: {[string]: {[string]: i64}}}` | `--seed 314116130 --depth 6` b |
| `(() => {[string]: (i32, i32, i32) => K0}[])[]` | `--seed 314116130 --depth 6` b |
| `{a: (i32, i32, i32) => {f: i64[] \| f64}, f: {[string]: {a: f64, f: f32, z: string}}, z: {a: (i32, i32, i32) => i64[] \| boolean, f: i32, z: {f: f32}}}` | `--seed 3277582 --depth 6` bm |
| `() => {a: {f: i32} \| null, f: {a: f64, f: f64 \| null, z: i64}, z: (i32, i32, i32) => {f: K0}}` | `--seed 508211898 --depth 4` bmd |

### INVALID-WASM — nullable-nested-array (`[][] | null`) cluster

| Shape | Repro |
|---|---|
| `(() => i32)[][] \| null` | `--seed 643381675 --depth 5` bm |
| `(f64 \| null)[][] \| null` | `--seed 74764069 --depth 6` bmd |
| `{f: {f: i64}}[] \| null` | `--seed 152244933 --depth 6` bm |

### INVALID-WASM — declared-seam (`twin:`/`mix:`) cluster

| Shape | Repro |
|---|---|
| `twin:{f: (string \| {w: i32} \| f64)[]}` | `--seed 112069971 --depth 4` bmd |
| `twin:{a: ({a: f64, f: f64, z: i64} \| boolean)[], f: {[string]: string}, z: string \| null}` | `--seed 43909430 --depth 4` bmd |
| `mix:{a: (i64 \| null)[], f: f32[], z: {f: f64} \| i32}` | `--seed 318743446 --depth 6` bmd |
| `mix:{f: (K0 \| i64 \| f64)[]} \| null` | `--seed 674396892 --depth 5` bmd |
| `mix:{a: i32, f: {[string]: {a: f32, f: K0 \| {w: i32} \| f64, z: i32} \| null}, z: i32}` | `--seed 318743446 --depth 6` bmd |

### INVALID-WASM — other composites

| Shape | Repro | Note |
|---|---|---|
| `{[string]: (() => {a: i64, f: () => i64, z: {[string]: i64}})[][]}` | `--seed 37649221 --depth 6` b | |
| `{a: {[string]: (i64[] \| f64)[]}, f: i64, z: string}` | `--seed 674045282 --depth 5` b | |
| `{[string]: {f: f64}[] \| null}` | `--seed 615401451 --depth 6` b | nullable-*list* map value: no niche rep minted (deep-map slice left it a loud REJECT at pinned seeds — verify which behavior this seed hits) |
| `{f: {a: {[string]: f64}, f: {f: boolean}, z: i64[]}} \| i32` | `--seed 643381675 --depth 5` bm | |
| `{f: {a: boolean \| string \| f64, f: {[string]: boolean[]}, z: {f: boolean \| null}}} \| f64` | `--seed 152244933 --depth 6` bm | |
| `() => {f: {a: i64 \| null, f: () => i32, z: {[string]: f64}}}[]` | `--seed 74764069 --depth 6` bmd | |
| `() => {[string]: K0}[]` | `--seed 228165384 --depth 4` bmd | |
| `() => {f: {[string]: {f: string}}}` | `--seed 261329272 --depth 4` b | may be fixed by 4ec8976/27eed81 |
| `((() => {a: f32, f: K0, z: i64}) \| i32)[] \| i32` | `--seed 74764069 --depth 6` bmd | may be fixed by 6f21705 (closure-array arm) |
| `{[string]: () => K0 \| null}` | `--seed 468772662 --depth 6` bm | likely fixed by 27eed81 (C1) — verify |
| `{a: {a: {f: f64} \| boolean, f: () => {f: () => f32 \| {w: i32} \| string}, z: (() => {[string]: K1}[])[]}, f: {a: i64, f: {[string]: {f: i64} \| i32}, z: {[string]: () => {a: i64, f: i64, z: K0} \| null}}, z: f64}` | `--seed 152244933 --depth 6` bm | depth-6 monster; triage last |

## 4. Soundness leads outside any fuzz net (from slice-agent wide runs; unconfirmed on current master)

- `TRAP p3r string | null` — CONFIRMED on current master by run 29801667445 (§0, seed 796537820
  d5). A shockingly simple shape at a deep nesting position.
- `INVALID-WASM p1r {a: f64, f: {...}, z: i64} | i64` (wide run, same agent).
- `TRAP (i32) => {...}[] | {w: i32}` — the §2 meta-family trapping instead of rejecting on some
  spellings.
- litunion PARAM narrowing → invalid wasm (map-value-closure agent, 2026-07-19): `p is "aa"`
  over a literal-union param emits invalid wasm in some atom-context use. Simple reconstructions
  compile fine; the exact trigger is narrower. Unconfirmed.

## 5. Picking this up on another machine

1. Clone; `bash scripts/fetch-seed.sh`; `cd scripts/vl-host && cargo build --release`;
   `bash scripts/refresh-compiler.sh`.
2. `cargo install wasm-tools --locked` — then `wasm-tools validate --features all x.wasm`
   (precise offset + reason), `wasm-tools print` (WAT disassembly; THE debugging view — diff a
   working sibling shape's WAT against the broken one's), `wasm-tools dump` (byte-level framing).
   See the wasm-debug section of docs/internals/agent-playbook.md.
3. Re-run every seed in §3 against current master first; work only the survivors. Suggested
   order: MISMATCH → TRAPs → multi-param-closure cluster (one root-cause hunt, many shapes) →
   `[][] | null` cluster → declared seams → others.
4. Manual nightly: `gh workflow run fuzz-nightly` (defaults: 10 fresh seeds × 200 × depths
   4/5/6). Findings artifact `fuzz-nightly-findings` has every kept failing case; the run log
   alone carries shape + exact repro seed for each finding.
5. Rules that keep this sound: INVALID-WASM/TRAP/MISMATCH are never baselineable — fix or make
   loudly reject; graduating a REJECT means removing exactly its baseline lines + pinning a
   tests/cases/ regression; `mAssignTypeIndices`/`*OffsetOf` and the `$fnsig` vocabulary are
   append-only; run the full gate (refresh → rep-fuzz-check → native-fixpoint → lint-self →
   `SELFHOST_NATIVE_ALIGN=1 deno task test`) before pushing.
