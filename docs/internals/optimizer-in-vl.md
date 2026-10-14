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
| strip `vl-src` | `strip_src`, which calls the compiler's `optStripSrc` | a `--source-map` build's source rows describe the emitter's bytes, which every later step rewrites; it is the only `-O` build whose module carries them |
| opt cache | `opt_cache_action` | keyed on the stripped bytes, the rung, `--names`, `--low-memory`, `--stable-layout`, the `wasm-opt` identity, the seed's digest and every `VL_*` variable; a hit skips the rest |
| inline step | `inline::inline_step` (with `flat::flat_step`) | a field holding a small unwritten record stores its fields in the parent; a list of such records holds them side by side; `$VL_OPT_NO_INLINE` skips it |
| multi-value step | `multivalue::multivalue_step` | a call site that only reads its small record result calls a twin returning the fields; `$VL_OPT_NO_MULTIVALUE` skips it |
| source-map remap | `remap` closure | a step that moves code rebuilds the map from the rows each moved op carries |
| escape step | `escape_inline_step`, which calls the compiler's `optEscapeChoose` / `optEscapeRestore` (`compiler/opt_escape.vl`) and runs `wasm-opt` between them | chooses callees whose struct argument never escapes, renames every function `L4c.<i>` / `L4n.<i>`, runs `wasm-opt -g --no-inline=L4n.* --always-inline-max-function-size 100000 --inlining`, restores the names |
| the rung's argv | `rung_argv`, which calls the compiler's `optRungArgv` (`compiler/opt_scan.vl`) | in order: `--no-inline=<name>` for each hot callee of run-once code (lane L8); `--low-memory-unused` at a `--low-memory-unused` of 1,024 bytes or more; `-g` under `--names`; `OPT_PASSES` (`--always-inline-max-function-size 16 -O`) or `RELEASE_PASSES` (`--closed-world -O3 --gufa -O3`); and `--skip-pass=ssa-nomerge` when a body has more than 8,192 `local.set`/`local.tee` |
| the rung | `optimize_in_place` | one `wasm-opt` run over the sink with the passes above |

## Rungs, in order, each with its oracle

Each rung lands as a VL export the host calls, behind a selector variable with three values:
`rust` (the default until parity), `vl`, and `both`, which runs the two and fails the build
when they disagree. The general oracle is `scripts/opt-parity.sh VAR=rust VAR=vl`: it builds every
program twice and compares exit status, the argv of every `wasm-opt` run (through a shim), and
the written module byte for byte; a timed-out build is UNCOMPARED, never agreeing. A side may also be the path of a `vl` binary,
which is how a retirement is graded: a host built before the Rust was deleted against the one
after, on one seed.

| rung | ports | selector | oracle beyond `opt-parity.sh` |
| --- | --- | --- | --- |
| R0 | a module reader: LEB128, value/heap/block types, every operator's immediates (`compiler/wasm_read.vl`) | — | R1's parity; it reads every module R1 reads |
| R1 | the run-once scan (`compiler/opt_scan.vl`); the default, its Rust deleted | retired (`$VL_OPT_RUNG_SCAN`) | the `wasm-opt` argv, which carries every mark the scan makes |
| R2 | the `vl-src` strip and the rung's argv (`compiler/opt_scan.vl`); the default, its Rust deleted | retired (`$VL_OPT_ARGV`) | argv identity, and the stripped bytes with their source map |
| R3 | the escape choice and its two renames (`compiler/opt_escape.vl`, `compiler/wasm_names.vl`); the default, its Rust deleted | retired (`$VL_OPT_ESCAPE`) | `$VL_OPT_ESCAPE_DUMP` byte-identical |
| R4 | a module writer: sections, types, bodies (`inline::assemble`, `type_section`, `encode_sub`, `finish_body`) | — | decode then encode is the identity over every module R1 reads |
| R5 | the multi-value step, with the host's last `rename_functions` (it names each twin `<name>.mv` under `--names`) | `$VL_OPT_MULTIVALUE` | `$VL_OPT_MV_DUMP` with `$VL_OPT_NO_INLINE=1`, and the moved rows a `--source-map` build remaps |
| R6 | the inline-record step | `$VL_OPT_INLINE` | `$VL_OPT_INLINE_DUMP`, and the `--source-map` file |
| R7 | the list-flattening step | `$VL_OPT_FLAT` | `$VL_OPT_FLAT_DUMP` |

The order is cheapest-first by what each needs: R1 and R2 only read; R3 rewrites one custom
section; R5 to R7 rewrite bodies and need R4. A rung's default switches, and its Rust is
deleted, in the PR after the one that proves parity, so a reviewer sees the port and the
deletion separately. When every rung is VL's, the host's chain is: hand the compiler the
emitted bytes, take back the module, the source-map rows and the `wasm-opt` argv, and run
`wasm-opt`. The cache stays in the host (it is the host's store); since R1 the seed's digest is
part of the opt key, because the compiler answers a rung.

Every rung is priced as it lands: `vl run scripts/seed-size.vl --compiler
build/vl-compiler.wasm -- --check` for the code it adds to the seed, and `plumb-shape-cost`
for the guest fuel and memory of the self-hosted step on a large unit.

## R1, landed beside the Rust

`compiler/opt_scan.vl` exports `optInReset`, `optInLoad`, `optRungScan`, `optOutLen`,
`optOutAt` and `optOutStore`. The host stages the module through linear memory in chunks,
calls `optRungScan`, and reads `optOut`: the extra pass on the first line (empty when none),
then one `--no-inline` name per line. While the Rust stood beside it, `$VL_OPT_RUNG_SCAN`
selected between them.

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

## R1, the default

The Rust scan, its selector and `SSA_SPLIT_MAX_SETS` are gone from the host; `rung_scan` (since R2, `rung_argv`) then
only stages the module and reads `optOut`, and a seed without `optInReset` refuses `-O` by
name. The oracle is `scripts/opt-parity.sh <vl before> <vl after>`, both on one seed, where
the first host is the one built at the port's head (Rust the default). Every build `-O`
unless noted:

| population | programs | identical | both refused | identical with a mark | differ | uncompared |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| tests/cases | 5,213 | 4,114 | 1,099 | 1,184 | 0 | 0 |
| distilled `cells/` | 1,477 | 1,223 | 254 | 1,103 | 0 | 0 |
| distilled `named/` | 8,647 | 4,919 | 3,728 | 1,295 | 0 | 0 |
| `-O3`: `cells/`, tests/cases/arrays and closures | 2,261 | 1,883 | 378 | 1,257 | 0 | 0 |
| a generated plumb tail unit and its main, and `compiler/entry.vl` | 3 | 3 | 0 | 2 | 0 | 0 |

The control, the port's host against `VL_OPT_NO_MULTIVALUE=1` over tests/cases/closures,
differs on 15 of 605.

## R2, the rung's argv and the `vl-src` strip

`compiler/opt_scan.vl` adds `optRungArgv(rung, names, lowMemory)`, which writes the whole
`wasm-opt` pass list for the staged module to `optOut`, one argument per line (marks,
low-memory pass, `-g`, the rung's passes, the extra pass), and `optStripSrc`, which writes the
staged module without its `vl-src` section and answers 1, or 0 when there is none. The pass
lists `OPT_PASSES` and `RELEASE_PASSES` now live there; the tests that run a rung's passes by
hand read them from that file. `BINARYEN_FEATURES` stays in the host, because `--wat` and
`wasm-dis` share it.

**Only one `vl-src` strip under `-O` was live.** The seed omits `vl-src` from an optimized
build unless `--source-map` asks for it, `--names` or not. The strip in the host's opt block,
which the wiring table used to list first, therefore never found a section. The live one
was the source-map block's, which runs after the map is written. That one now calls
`optStripSrc`, and the opt-block strip is gone. The parity below shows the deletion is
safe: the Rust side kept the dead strip, the VL side never ran it, and every module agreed.

Parity of the port, `VL_OPT_ARGV=rust` against `vl`. Every build is `-O` unless noted:

| population | programs | identical | both refused | identical with a mark | differ | uncompared |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| tests/cases | 5,213 | 4,114 | 1,099 | 1,184 | 0 | 0 |
| distilled `cells/` | 1,477 | 1,223 | 254 | 1,103 | 0 | 0 |
| distilled `named/` | 8,647 | 4,919 | 3,728 | 1,295 | 0 | 0 |
| `-O3`: `cells/`, tests/cases/arrays and closures | 2,261 | 1,883 | 378 | 1,257 | 0 | 0 |
| a generated plumb tail unit and its main, and `compiler/entry.vl` | 3 | 3 | 0 | 2 | 0 | 0 |
| tests/cases, `--source-map` | 5,213 | 4,114 | 1,099 | 1,184 | 0 | 0 |
| tests/cases, `--names` | 5,213 | 4,114 | 1,099 | 1,184 | 0 | 0 |
| tests/cases, `--low-memory-unused` | 5,213 | 4,114 | 1,099 | 1,184 | 0 | 0 |
| tests/cases, `--names --source-map`, `both` against `vl` | 5,213 | 4,114 | 1,099 | 1,184 | 0 | 0 |

`opt-parity.sh` gained `--flag` for these rows, and it now compares a `--source-map` build's
map as well as its module. `both` fails a build whose two argvs or two stripped modules
differ, so the last row compares the two sides build by build. The control, `vl` against
`VL_OPT_NO_INLINE=1` over tests/cases/arrays, differs on 25 of 179.

Retirement: the host built at the port's head (Rust the default) against the host with the
Rust deleted, on one seed:

| population | programs | identical | both refused | identical with a mark | differ | uncompared |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| tests/cases | 5,213 | 4,114 | 1,099 | 1,184 | 0 | 0 |
| distilled `cells/` | 1,477 | 1,223 | 254 | 1,103 | 0 | 0 |
| distilled `named/` | 8,647 | 4,919 | 3,728 | 1,295 | 0 | 0 |
| `-O3`: `cells/`, tests/cases/arrays and closures | 2,261 | 1,883 | 378 | 1,257 | 0 | 0 |
| a generated plumb tail unit and its main, and `compiler/entry.vl` | 3 | 3 | 0 | 2 | 0 | 0 |
| tests/cases, `--names --source-map` | 5,213 | 4,114 | 1,099 | 1,184 | 0 | 0 |
| tests/cases, `--source-map --low-memory-unused=0x10000` | 5,213 | 4,045 | 1,168 | 1,160 | 0 | 0 |
| `-O3 --names`: tests/cases/arrays and closures | 784 | 660 | 124 | 154 | 0 | 0 |

The control, the port's host against `VL_OPT_NO_MULTIVALUE=1` over tests/cases/closures,
differs on 15 of 605. A seed without `optStripSrc` refuses `-O` by name.

## R3, the escape choice and its renames

`compiler/opt_escape.vl` exports `optEscapeChoose`, which chooses the callees for the staged
module and writes it to `optOut` with every chosen callee named `L4c.<index>` and every other
defined function `L4n.<index>` (answering 1, or 0 when nothing is chosen), and
`optEscapeRestore`, which takes the step's output and gives every function back the name it
had in the module `optEscapeChoose` renamed. `compiler/wasm_names.vl` is the name-section
reader and writer both use: it keeps every other subsection byte for byte, and writes one
`name` section at the end with minimal LEB lengths, as the host's `rename_functions` does.
The scan behind the choice is R1's, run in a full mode that also reads the type, function,
table and global sections and records each body's allocations and casts; `wasm_read.vl`
gained the heap-type immediates of `struct.new`, `ref.test`, `ref.cast` and `br_on_cast`.

While the Rust stood beside it, `$VL_OPT_ESCAPE` selected the side: unset or `rust` the
host's `escape_inline_choice` and `rename_functions`, `vl` the compiler's, `both` the two on
one compiler instance, failing the build when the renamed input or the restored output
differed. The host still runs `wasm-opt` between the two calls, and still checks that a
`--source-map` build's code did not move.

Parity of the port, `VL_OPT_ESCAPE=rust` against `vl`. `opt-parity.sh` now also compares the
step's own output (`$VL_OPT_ESCAPE_DUMP`, written before the rung strips the names `-O` does
not keep), and counts the builds that ran the step. Every build is `-O` unless noted:

| population | programs | identical | both refused | identical with a mark | identical through the step | differ | uncompared |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| tests/cases | 5,218 | 4,118 | 1,100 | 1,184 | 639 | 0 | 0 |
| distilled `cells/` | 1,477 | 1,223 | 254 | 1,103 | 270 | 0 | 0 |
| distilled `named/` | 8,647 | 4,919 | 3,728 | 1,295 | 606 | 0 | 0 |
| `-O3`: `cells/`, tests/cases/arrays and closures | 2,265 | 1,886 | 379 | 1,257 | 356 | 0 | 0 |
| a generated plumb tail unit and its main, and `compiler/entry.vl` | 3 | 3 | 0 | 2 | 1 | 0 | 0 |
| tests/cases, `--source-map` | 5,218 | 4,118 | 1,100 | 1,184 | 639 | 0 | 0 |
| tests/cases, `--names` | 5,218 | 4,118 | 1,100 | 1,184 | 639 | 0 | 0 |
| tests/cases, `--names --source-map --low-memory-unused`, `both` against `vl` | 5,218 | 4,118 | 1,100 | 1,184 | 639 | 0 | 0 |

`both` fails a build whose two renamed inputs or two restored outputs differ, so the last row
compares the two sides build by build. The control, `vl` against `VL_OPT_NO_MULTIVALUE=1`
over tests/cases/closures, differs on 18 of 609; on 2 of them the written modules agree and
only the step's output differs, which is what the new comparison is for.

## R3, the default

The host's `escape_inline_choice`, `escape_expanded`, the `ModuleScan` behind them, the
escape-only bounds and prefixes, and the `$VL_OPT_ESCAPE` selector are gone; `escape_inline_step`
now stages the module, calls `optEscapeChoose`, runs `wasm-opt` on its answer and calls
`optEscapeRestore` on the same instance. A seed without `optEscapeChoose` refuses `-O` by name.
`rename_functions` stays in the host for one more rung: the multi-value step names each twin
`<name>.mv` under `--names` through it, so it leaves with R5. `opt-parity.sh` refuses a retired
selector (`$VL_OPT_RUNG_SCAN`, `$VL_OPT_ARGV`, `$VL_OPT_ESCAPE`) as a side, since the host
ignores it and both sides would be the same build.

Retirement: the host built at the port's head (Rust the default) against the host with the
Rust deleted, on one seed:

| population | programs | identical | both refused | identical with a mark | identical through the step | differ | uncompared |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| tests/cases | 5,222 | 4,120 | 1,102 | 1,184 | 639 | 0 | 0 |
| distilled `cells/` | 1,477 | 1,223 | 254 | 1,103 | 270 | 0 | 0 |
| distilled `named/` | 8,647 | 4,919 | 3,728 | 1,295 | 606 | 0 | 0 |
| `-O3`: `cells/`, tests/cases/arrays and closures | 2,265 | 1,886 | 379 | 1,257 | 356 | 0 | 0 |
| a generated plumb tail unit and its main, and `compiler/entry.vl` | 3 | 3 | 0 | 2 | 1 | 0 | 0 |
| tests/cases, `--source-map` | 5,222 | 4,120 | 1,102 | 1,184 | 639 | 0 | 0 |
| tests/cases, `--names` | 5,222 | 4,120 | 1,102 | 1,184 | 639 | 0 | 0 |
| tests/cases, `--names --source-map --low-memory-unused=0x10000` | 5,222 | 4,051 | 1,171 | 1,160 | 620 | 0 | 0 |
| `-O3 --names`: tests/cases/arrays and closures | 788 | 663 | 125 | 154 | 86 | 0 | 0 |

The control, the port's host against `VL_OPT_NO_MULTIVALUE=1` over tests/cases/closures,
differs on 18 of 609, as it did for the port.
