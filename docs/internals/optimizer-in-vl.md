# The `-O` optimizer in VL — the port plan

Owner ruling (A), plan row T4 / L10: `-O` becomes a VL compiler pass over the emitted module,
identical for every host. The host's own optimizer — `scripts/vl-host/src/inline.rs`,
`multivalue.rs`, `flat.rs` and the `-O` parts of `main.rs` — retires rung by rung: each rung is
ported into `compiler/` BESIDE its Rust, selectable by an environment variable, graded
byte-identical against the Rust over tests/cases and the distilled corpus, then made the
default and its Rust deleted. Binaryen (`wasm-opt`) stays an external tool; what moves is
everything VL does to the module around it.

## How `-O` is wired today

`vl build -O` (and `-O3`, which wins when both are given) runs this chain in `build_cmd`
(`main.rs`), after the emitter's bytes are written to the sink:

| step | where | what it does |
| --- | --- | --- |
| strip `vl-src` | `without_custom_section` | a `--names` build's source rows describe the emitter's bytes, which every later step rewrites |
| opt cache | `opt_cache_action` | keyed on the stripped bytes, the rung, `--names`, `--low-memory`, `--stable-layout`, the `wasm-opt` identity and every `VL_*` variable; a hit skips the rest |
| inline step | `inline::inline_step` (with `flat::flat_step`) | a field holding a small unwritten record stores its fields in the parent; a list of such records holds them side by side; `$VL_OPT_NO_INLINE` skips it |
| multi-value step | `multivalue::multivalue_step` | a call site that only reads its small record result calls a twin returning the fields; `$VL_OPT_NO_MULTIVALUE` skips it |
| source-map remap | `remap` closure | a step that moves code rebuilds the map from the rows each moved op carries |
| escape step | `escape_inline_step` | chooses callees whose struct argument never escapes (`escape_inline_choice`), renames every function `L4c.<i>` / `L4n.<i>`, runs `wasm-opt -g --no-inline=L4n.* --always-inline-max-function-size 100000 --inlining`, restores the names |
| rung passes | `rung_passes` | `-g` under `--names`, `--low-memory-unused` at a large `--low-memory`, then `OPT_PASSES` (`--always-inline-max-function-size 16 -O`) or `RELEASE_PASSES` (`--closed-world -O3 --gufa -O3`) |
| run-once scan | `rung_scan` | `--no-inline=<name>` for each hot callee of run-once code (lane L8), and `--skip-pass=ssa-nomerge` when a body has more than 8,192 `local.set`/`local.tee` |
| the rung | `optimize_in_place` | one `wasm-opt` run over the sink with the passes above |

## Rungs, in order, each with its oracle

Each rung lands as a VL export the host calls, behind a selector variable with three values:
`rust` (the default until parity), `vl`, and `both`, which runs the two and fails the build
when they disagree. The general oracle is `scripts/opt-parity.sh VAR rust vl`: it builds every
program twice and compares exit status, the argv of every `wasm-opt` run (through a shim), and
the written module byte for byte; a timed-out build is UNCOMPARED, never agreeing.

| rung | ports | selector | oracle beyond `opt-parity.sh` |
| --- | --- | --- | --- |
| R0 | a module reader: LEB128, value/heap/block types, every operator's immediates (`compiler/wasm_read.vl`) | — | R1's parity; it reads every module R1 reads |
| R1 | the run-once scan, `rung_scan` + `run_once_hot_callees` (`compiler/opt_scan.vl`) | `$VL_OPT_RUNG_SCAN` | the `wasm-opt` argv, which carries every mark the scan makes |
| R2 | the `vl-src` strip and the rung's argv (`rung_passes`, the low-memory pass) | `$VL_OPT_ARGV` | argv identity, and the stripped bytes |
| R3 | the escape choice and its two renames (`escape_inline_choice`, `rename_functions`) — needs a name-section writer | `$VL_OPT_ESCAPE` | `$VL_OPT_ESCAPE_DUMP` byte-identical |
| R4 | a module writer: sections, types, bodies (`inline::assemble`, `type_section`, `encode_sub`, `finish_body`) | — | decode then encode is the identity over every module R1 reads |
| R5 | the multi-value step | `$VL_OPT_MULTIVALUE` | `$VL_OPT_MV_DUMP` with `$VL_OPT_NO_INLINE=1`, and the moved rows a `--source-map` build remaps |
| R6 | the inline-record step | `$VL_OPT_INLINE` | `$VL_OPT_INLINE_DUMP`, and the `--source-map` file |
| R7 | the list-flattening step | `$VL_OPT_FLAT` | `$VL_OPT_FLAT_DUMP` |

The order is cheapest-first by what each needs: R1 and R2 only read; R3 rewrites one custom
section; R5 to R7 rewrite bodies and need R4. A rung's default switches, and its Rust is
deleted, in the PR after the one that proves parity, so a reviewer sees the port and the
deletion separately. When every rung is VL's, the host's chain is: hand the compiler the
emitted bytes, take back the module, the source-map rows and the `wasm-opt` argv, and run
`wasm-opt`. The cache stays in the host (it is the host's store); a rung the compiler answers
makes the seed's digest part of the opt key.

Every rung is priced as it lands: `vl run scripts/seed-size.vl --compiler
build/vl-compiler.wasm -- --check` for the code it adds to the seed, and `plumb-shape-cost`
for the guest fuel and memory of the self-hosted step on a large unit.

## R1, landed beside the Rust

`compiler/opt_scan.vl` exports `optInReset`, `optInLoad`, `optRungScan`, `optOutLen`,
`optOutAt` and `optOutStore`. The host stages the module through linear memory in chunks,
calls `optRungScan`, and reads `optOut`: the extra pass on the first line (empty when none),
then one `--no-inline` name per line. `rung_scan_selected` (`main.rs`) is the selector.

Parity, `VL_OPT_RUNG_SCAN=rust` against `vl`, every build `-O` unless noted:

| population | programs | identical | both refused | identical with a mark | differ | uncompared |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| tests/cases | 5,212 | 4,113 | 1,099 | 1,184 | 0 | 0 |
| distilled `cells/` | 1,477 | 1,223 | 254 | 1,103 | 0 | 0 |
| distilled `named/` | 8,647 | 4,919 | 3,728 | 1,295 | 0 | 0 |
| `-O3`: `cells/`, tests/cases/arrays and closures | 2,261 | 1,883 | 378 | 1,257 | 0 | 0 |
| a generated plumb tail unit and its main, and `compiler/entry.vl` | 3 | 3 | 0 | 2 | 0 | 0 |

"With a mark" counts builds whose argv carried a `--no-inline` or `--skip-pass`, so the
comparison was not of two empty answers. Only the plumb tail unit crosses the 8,192-set bound,
so the `--skip-pass=ssa-nomerge` arm is graded by that one program. `rust` against an unknown
value is reported as differing, which is the harness's control.
