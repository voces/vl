# VL engineering review after the IR cutover, 2026-11-27

A read of the compiler at master `eb73e58c`, one day after I8 landed. It follows
[`engineering-review-2026-11.md`](engineering-review-2026-11.md) (2026-11-14, before the IR) and
says what the migration changed, what it did not, and what to do next. Four reviewers each read one
area (the IR; the checker; representation, codegen and the optimizer; frontend, driver and tooling).
The headline claims were then re-run on a native `vl` built from this commit with the `seed-latest`
seed.

Each claim is **[ran]** (observed on that binary), **[read]** (read in the source at the cited
path) or **[inferred]**. Counts are `grep` or `wc` counts over `compiler/*.vl` unless a file is
named; none is an ablation. Nothing in the tree was changed and no gate was run.

Not measured: `-O`, the cross-runtime benchmark sweep, and the number of full check passes a build
makes.

---

## 1. Verdict

The IR migration changed how code is emitted, not what is emitted. The two things that were to
follow from it have not started: optimisation on the IR, and the end of capability refusals. The
checker is now the largest compile cost and the least changed part of the compiler.

## 2. Measured on this tree **[ran]**

- **Self-compile** (`VL_FUEL=1 VL_GC_STATS=1 vl build compiler/entry.vl`): 58.8 s wall, 115 G fuel,
  4.0 GB allocated, 1.35 GiB peak live, for 475,525 lines. About 8k lines per second.
- **Fuel by phase** (`scripts/perf/profile-phases.vl --weighted`, a `--names` seed):

  | phase | share of run |
  |---|--:|
  | `checkProgram` | 42% |
  | code payload (`buildCodePayload`: IR build, verify, lower) | 33% |
  | emit passes (`runEmitPasses`) | 9% |
  | `elabPrepare` | 7% |
  | `emitModule`, other | 4% |
  | lex, parse, rename, load | under 4% together |

- **Generated code**, by `wasm-dis` of small probes built with no `-O`:
  - a helper `small(a, b)` called in a loop is a `call`; nothing is inlined;
  - `xs[i]` under `while i < xs.length` hoists the list header but keeps its own bounds test, and
    the loop condition re-reads the length field, so each element pays three compares (the loop
    condition, the test, the engine's `array.get` check);
  - a function returning `i32 | null` returns a `{tag: i32, value: anyref}` box;
  - a capturing closure is two `struct.new` and a `call_indirect`; a literal lambda argument is
    specialised to a direct `return_call`;
  - record fields are declared mutable; a record is a heap struct returned by reference.
- `match s.kind { "circle" => … }` does not narrow `s`; `if s.kind == "circle"` does.
- A type error is followed by a Rust stack backtrace on a development build.

## 3. Architecture

### 3.1 The IR is not self-contained **[read]**

- `Rhs` has 125 kinds (`ir.vl:727`) and `IrNode` 23 statements; the design promised 21 and 16
  (`ir-design-2026-11.md` §1.6).
- About 97 of the 125 kinds carry an AST node index (`*At`), and lowering re-derives the plan from
  the AST and global tables: `ir_lower.vl` has 99 `nodeAt(` calls and imports about 730 legacy
  names, about 490 of them from `wasmEmit.vl`. Roughly 18 kinds are self-describing (`RPrimOp`,
  `RCall`, `RCast`, `RCellGet`, `RTest`, `RTagOf`, `RRetag`, …).
- Many kinds encode one legacy function each: `RVariantDiscrim`, `RVariantChain`, `RRecordFitIs`,
  `RSharedRead`, `RUnionNumCrossEq`, `RHoleOptBox`, `RDeadNullTest`, `RMaFoldInit`.
- `IrFn` has 67 fields, 28 of them maps mostly keyed by AST node.
- `wasmEmit.vl` is still 34,259 lines: the recursive expression emitter is a stub
  (`wasmEmit.vl:19204`), but its tails and plans are the lowering.

A pass cannot move, duplicate or delete a node whose meaning lives in an AST-keyed plan.

### 3.2 Temps follow legacy byte order **[read]**

A temp goes back onto the wasm stack at its one use, and only when consumed in definition order
(`ir_lower.vl:3-7`). A violation is a lowering refusal ("non-stack temp: out of order", "used
twice", "unconsumed"). Nodes exist only to mirror legacy's order (`RCallRefHead`, `RStashSet`,
`RListStage`, `RUnionStage`, `RTagStash`). Byte identity stopped being a gate on 2026-11-25, so
this constraint is now free to drop: spill any multi-use or out-of-order temp to a local.

### 3.3 No IR-to-IR passes **[read]**

The pipeline is AST rewrites, mono by AST cloning, build, verify, lower, then byte-decoding
`opt_*.vl` plus external `wasm-opt` under `-O`. Eleven of the 32 emit passes
(`emit_sections.vl:4100-4131`) still rewrite or mint AST before the IR exists. `ir.vl` exports no
def-use, effect or purity information. Local slots and scratch frames are laid out by legacy AST
scans before the build, so a pass cannot add a local. A rep is valid only within one rebuild epoch.

### 3.4 The refusal class moved **[read]**

About 1,350 decline sites: 968 `irBMiss(`/`missRhs(` in `ir_build.vl` and 384 `irLMiss(` in
`ir_lower.vl`, against the 679 `emitFail` sites the earlier review counted. A verifier failure is
reported as "cannot yet lower" (`ir_build.vl:1362`), which files a compiler bug as a capability
gap. The holdout list has about 145 rows over about 90 classes, so its gaps are positional cells,
not families.

### 3.5 The checker **[read]**

- **Re-check everything.** Each solver round is a `checkRestart` plus a full `checkProgramPass`
  (`check_pins.vl:237-275`); there is no worklist or dependency order.
- **Types are not hash-consed.** ARCHITECTURE §3.3 lists seven notions of equality; `tySame` is
  depth-capped at 24 and answers `false` on exhaustion (`check_types.vl:4185`). `assignable` has no
  persistent memo.
- **Holes are named by strings** (`"?" + fnName + "." + i`, `check_tp_join.vl:693`);
  `solvedParamTys` is a string-keyed map; substitution takes `bNames: string[]` in 126 signatures.
  Annotations are strings (`TypeRef.tyName`, `ast.vl:93`).
- **No expected type.** `checkNode(ix)` synthesises, then `assignableExprIn` (220 lines of ordered
  hooks, `check_assignable.vl:2234`) retro-adopts literal widths; a `let t = 0` that should be
  `f64` is fixed by a whole-program re-check.
- **Inferred interfaces (L2) stopped at S3.** The per-position `hole*` judges grew from 293 to 320;
  each new operation on a hole still needs its own derived-hole kind (16 `HD_*`).
- **Flow is AST walks.** No CFG; write-effect summaries are per SCC but dropped mid-check, and no
  `opt_*` module reads them.
- 525 `tErr(` sites against 14 coded ones; `TDiag` has no notes or related spans. The checker still
  issues 12 distinct "not supported" literals.

Fixed since 2026-11-14: the for-in hole arm, call-site wording for bound failures, rollback masks
as named sets, binder identity for declared type parameters, constraint rows unified into `Iface`.

### 3.6 One compilation unit, global state **[read]**

- 4,930 module-level `let`s and 226 `*Reset` functions; a missed reset is found only empirically.
- Modules still merge by `$m<id>` renaming. Per-module artifacts are built through step 5 and
  switched off (`emit_reloc.vl:9`, `RELOC_ARMED = false`); about 3.8k lines of it ship in the seed.
- Every CLI build re-lexes, re-parses, re-checks and re-emits std and every dependency.
- The LSP awaits lint and check on the main thread per change, with no debounce and no
  cancellation (`lsp/src/server.ts:321-405`).
- Self-compile fuel per thousand lines rose from 0.23 G (2026-10-06) to 0.30 G.

### 3.7 Debris and stale docs **[read]**

- Ten `*shadow*.vl` modules (2,652 lines), `ir_selftest.vl` (1,918 lines) and the `VL_IR_SHADOW`
  modes, which now compare against a stubbed emitter, ship in the seed.
- `compiler/entry.wasm` (6.5 MB) is tracked in git.
- `docs/ARCHITECTURE.md` is normative, does not mention the IR, and describes a 47-row pass table
  with pass names that no longer exist.
- `bench/results/summary.md` is the 2026-08-03 sweep and has no `-O` column.

## 4. Gaps most compilers do not have

| Gap | Evidence | Why it matters here |
|---|---|---|
| No inliner | [ran]; the host never enables the engine's, and the project measured that knob as a loss (`DECISIONS.md:7685`) | Header hoisting and unrolling switch off when a loop body holds a call (`wasmEmit.vl:14386`, `28476`) |
| No call graph, no DCE in a plain build | `ROADMAP.md` backlog | Size, engine compile time, host imports; the inliner needs the same graph |
| No def-use or effect facts on the IR | §3.3 | Precondition of every other pass |
| Scalar unions and nullable numerics are boxed; no `i31ref` | [ran]; zero `i31` hits in the emitter | Every `find`-style return, `Map.get` of a scalar, JSON numbers |
| Every struct field is mutable | `emit_sections.vl:6060` | The engine cannot CSE loads |
| Mono keys on type spelling; no sharing by rep | `emit_mono.vl:8547`; the rep key runs only under a shadow | Duplicate bodies |
| No wasm validator or typed operand stack | grep over `emit_bytes.vl` | Invalid modules are found by the engine |
| No independent oracle | the fuzzer skips arithmetic (`fuzzgen.vl:1-7`) | Expectations are the compiler's own output |
| SROA, multi-value returns, flat lists only under `-O` | `opt_multivalue.vl`, `opt_inline_scan.vl` | Default builds, and the seed, get none of them |

Already good and to be kept: callback specialisation, `return_call`, range-loop unrolling, string
views with a cached hash, free non-capturing closures, final struct types, `br_table` switches.

## 5. Suggested order

1. **Clear the ground.** Delete the shadow and byte-identity machinery. Spill temps to locals.
   Ratchet the count of AST-backed `Rhs` kinds and of miss sites so both only fall. Report a
   verifier failure as an internal error.
2. **Facts, then passes.** Build a call graph, def-use and a per-function effect summary once on the
   IR. Then DCE, then the inliner, then bounds-check elimination and scalar replacement on the
   default path. Move the eleven AST rewrite passes behind the builder as they become expressible.
3. **The checker.** Integer hole ids, then hash-consed types, then `check(node, expected)` for
   literals, lambdas, `{}` and `[]`, then L2 S4–S7. This is where 42% of the compile is.
4. **Modules.** Finish the per-module artifact path now that exports are frozen at the module
   boundary, or delete it from the seed.
5. **Hygiene.** Rewrite ARCHITECTURE §2; untrack `compiler/entry.wasm`; re-run the benchmark sweep
   with an `-O` column; make the LSP latest-wins.

## 6. Features particular to an inference-heavy data-structure language

Inference stays; these build on it.

- **Representation inference.** The world is closed and no layout is promised to the user, so the
  compiler may choose: a fixed array for a never-grown list; a dense array for a map with small
  integer keys; a bitset for a set of small integers; struct-of-arrays for a list of records read
  by column; immutable or dropped fields where nothing writes or reads them.
- **Inferred effects as a product.** Purity, escape and uniqueness summaries exist in part for
  covariance soundness. Shared with the optimizer they allow in-place update of a uniquely held
  list in `xs.map(f)`, stack allocation of non-escaping records, compile-time evaluation of pure
  calls into data segments, and the two backlogged narrowing rulings in ROADMAP.
- **Provenance for inferred types.** "Why is this `i32`?" answered as the chain of sites that
  pinned it. Errors at a distance are the main user cost of inference.
- **A type-drift report.** Snapshot the inferred signatures of exports and diff them in CI. An edit
  that silently changes an inferred type becomes visible, and the same fingerprint is the early
  cutoff incremental checking needs.
- **Fusion of collection pipelines.** `map`/`filter`/`reduce` chains fused into one loop on the IR,
  building on callback specialisation.
- **Fuel-driven profile guidance.** Fuel is a deterministic profile, so it can feed inlining and
  layout decisions reproducibly.

## 7. Reproducing the measurements

```sh
bash scripts/fetch-seed.sh && (cd scripts/vl-host && cargo build --release)
VL_FUEL=1 VL_GC_STATS=1 vl build compiler/entry.vl -o /tmp/self.wasm
vl build compiler/entry.vl --names -o /tmp/names.wasm
VL_FUEL=1 VL_PROFILE_GUEST_FUEL=1 VL_PROFILE_GUEST=/tmp/p.json \
  vl build compiler/entry.vl -o /tmp/self2.wasm --compiler /tmp/names.wasm
vl run scripts/perf/profile-phases.vl -- /tmp/p.json --weighted
vl build probe.vl -o probe.wasm --names && ./node_modules/.bin/wasm-dis --all-features probe.wasm
```

The seed used is `seed-latest`, not a fixpoint seed of this commit, so the fuel figure is a reading,
not a baseline.
