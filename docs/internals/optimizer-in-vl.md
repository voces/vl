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
| multi-value step | `multivalue_step`, which calls the compiler's `optMultivalue` (`compiler/opt_multivalue.vl`) | a call site that only reads its small record result calls a twin returning the fields; `$VL_OPT_NO_MULTIVALUE` skips it |
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
| R4 | a module writer: sections, types, bodies (`inline::assemble`, `type_section`, `encode_sub`, `finish_body`) (`compiler/wasm_write.vl`) | `$VL_OPT_ROUNDTRIP` (a check, not a side) | decode then encode is the identity over every module R1 reads |
| R5 | the multi-value step, with the host's last `rename_functions` (it names each twin `<name>.mv` under `--names`) (`compiler/opt_multivalue.vl`); the default, its Rust deleted | retired (`$VL_OPT_MULTIVALUE`) | `$VL_OPT_MV_DUMP` with `$VL_OPT_NO_INLINE=1`, and the moved rows a `--source-map` build remaps |
| R6a | the inline-record step's census: whether any field or element holds a leaf record (`compiler/opt_inline.vl`); beside the Rust | `$VL_OPT_INLINE` | the `$VL_INLINE_EXPLAIN` lines, and the module bytes |
| R6b, R6c | the inline-record step's walk and decision, then its rewrite | `$VL_OPT_INLINE` | `$VL_OPT_INLINE_DUMP`, and the `--source-map` file |
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
`<name>.mv` under `--names` through it, so it left with R5's Rust. `opt-parity.sh` refuses a retired
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

## R4, the module writer

`compiler/wasm_write.vl` decodes a module into a `WasmModule` and writes one back. `wmRead`
keeps the type section as rec groups of `WasmSubType`, the function section as a list of type
indices, and the code section as one `WasmBody` per function: its locals entries, and its code
as a slice of the bytes read. Every other section is kept as the span it was read from.
`wmWrite` writes those three sections from the model with minimal LEB128s, copies the rest in
input order, and reports where each body's code begins in the output, which a source-map remap
needs. A value type is one packed `i32`, its heap type's index readable without a lookup. The
decoder refuses a shared heap type and a descriptor form; the host's writer has neither.

R6 and R7 edit the model between the two calls. R5 reads through `wmRead` but writes its
three sections by appending to the bytes it read, as the host's step does. A new type goes in its own group at the end,
and a new function at the end of both lists, so no existing index moves and the copied
sections stay valid. A rewritten body gets new code bytes and `from` 0, and its new locals
are appended one entry per run of a type, as `finish_body` does. The Rust stays the
default until those rungs move onto this writer, and it is deleted with them.

`$VL_OPT_ROUNDTRIP=1` makes the build check the writer. The compiler's `optRoundTrip` decodes
the emitted module and every rung's input, writes each one back, and the build fails unless
every byte matches. `fault` flips a bit of the answer before the comparison, which is the
control. Parity is `VL_OPT_ROUNDTRIP=` against `VL_OPT_ROUNDTRIP=1`, so a module the writer
changed is a build the second side refused. Every build is `-O` unless noted:

| population | programs | identical | both refused | identical with a mark | identical through the step | differ | uncompared |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| tests/cases | 5,224 | 4,123 | 1,101 | 1,184 | 639 | 0 | 0 |
| distilled `cells/` | 1,477 | 1,223 | 254 | 1,103 | 270 | 0 | 0 |
| distilled `named/` | 8,647 | 4,919 | 3,728 | 1,295 | 606 | 0 | 0 |
| `-O3`: `cells/`, tests/cases/arrays and closures | 2,267 | 1,889 | 378 | 1,257 | 356 | 0 | 0 |
| a generated plumb tail unit and its main, and `compiler/entry.vl` | 3 | 3 | 0 | 2 | 1 | 0 | 0 |

The control, `VL_OPT_ROUNDTRIP=1` against `fault` over tests/cases/closures, differs on 511 of
611: every program that builds. `tests/selfhost_native_opt_test.ts` holds both on three
fixtures at both rungs.

The seed grew by 1.0%, from 5,309,038 to 5,363,983 bytes, and the self-compile's guest fuel
by 0.2%. The writer's own functions are 7,602 of those bytes. The rest is spread thinly over
functions this rung does not touch, and the one cause read off the disassembly is type
indices: the writer's record types take indices ahead of the compiler's busiest types, and an
index past 127 costs a second LEB byte at every use. `$127` becoming `$135` is one such shift.


## R5, the multi-value step, beside the Rust

`compiler/opt_multivalue.vl` exports `optMultivalue`, which reads the staged module through
`wmRead`, finds the record types a producer returns and every call site that only reads the
record's fields, and writes the module with a twin per producer that returns those fields as
multi-value. `optMultivalueMoves` hands back each rewritten body's move, which the host's
source-map remap reads, and `optMultivalueExplain` the `$VL_MV_EXPLAIN` report. The host keeps
`field_facts`, `scalarized`, the LEB writers, `concrete_index`, `function_names`, `BodyMove`
and `Num`, and validates the answer as before: a rewrite that does not validate is dropped.

`$VL_OPT_MULTIVALUE` selects the side: unset or `vl` the compiler's step, `rust` the host's,
`both` the two on one input, failing the build when the module bytes, the body moves, whether
it rewrites, or the explain lines differ. `opt-parity.sh` also compares the step's own output
(`$VL_OPT_MV_DUMP`). `VL_OPT_MULTIVALUE=rust` against `vl`, every build `-O` unless noted:

| population | programs | identical | both refused | identical with a mark | identical through the step | differ | uncompared |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| tests/cases, distilled `cells/` and `named/`, a plumb tail unit and its main, and `compiler/entry.vl` | 15,348 | 10,265 | 5,083 | 3,582 | 1,515 | 0 | 0 |
| the same, `VL_OPT_NO_INLINE=1` | 15,348 | 10,265 | 5,083 | 3,586 | 1,519 | 0 | 0 |
| `-O3`: `cells/`, tests/cases/arrays and closures | 2,267 | 1,889 | 378 | 1,257 | 356 | 0 | 0 |
| tests/cases, `--source-map` | 5,224 | 4,123 | 1,101 | 1,184 | 639 | 0 | 0 |
| tests/cases, `--names` | 5,224 | 4,123 | 1,101 | 1,184 | 639 | 0 | 0 |
| tests/cases, `--names --source-map`, `both` against `vl` | 5,224 | 4,123 | 1,101 | 1,184 | 639 | 0 | 0 |

Two controls over tests/cases/closures each differ on 26 of 611: `VL_MV_FAULT=0` against `1`
on the compiler's side, and `vl` against `VL_OPT_NO_MULTIVALUE=1`.
`tests/selfhost_native_release_multivalue_test.ts` builds every fixture under `both` and runs
the fault test on each side.

The seed grew by 2.1%, from 5,364,991 to 5,475,793 bytes, and the self-compile's guest fuel by
2.75%. The plumb-shape fuel does not move, since it does not meter the optimizer's
instance.

The compiler's step is the default. On the module `compiler/entry.vl -O` hands the step
(5,475,793 bytes in, 5,502,539 out), the median of seven alternating runs is 215 ms for the
host's step and 326 ms for the compiler's, 1.52 times as long. The seed built at #3737's head
took 527 ms on the same host, and its guest fuel for the step falls from 4,162,443,666 to
1,832,179,732. Four changes account for this:

* the scan dispatches each operator through an arity table instead of a decoder;
* an unchanged body is copied whole into a rope of byte ranges;
* the per-local maps became dense tables;
* the host validates the input on a second thread while the step runs. An input that does
  not validate is stepped again with `valid` 0.

The remaining gap is bounded by:

* the seed being built without `-O`, so the small readers are calls;
* a bounds check and a push per byte through GC arrays;
* copying the module into the compiler and back out through linear memory;
* the scan visiting every operator of the module.

## R5, the default

The host's `multivalue_rust` and the step behind it (its planner, twin writer, merge rewrite
and explain report), `rename_functions`, and the `$VL_OPT_MULTIVALUE` selector are gone;
`multivalue_step` calls `optMultivalue` alone. The list-flattening step's cost rule asked the
Rust step which locals and parameters it would hold field by field; it now asks the compiler,
through `optMultivalueScalarized`, on a fresh instance per question. `multivalue.rs` keeps the
analysis `field_facts` reads, which the inline-record and flattening steps use, so it leaves
with R6 and R7. A seed without `optMultivalueScalarized` refuses such a build by name.

Retirement: the host built at #3749's head against the host with the Rust deleted, on one seed:

| population | programs | identical | both refused | identical with a mark | identical through the step | differ | uncompared |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| tests/cases, distilled `cells/` and `named/` | 15,372 | 10,293 | 5,079 | 3,586 | 1,518 | 0 | 0 |
| `-O3`: `cells/`, tests/cases/arrays and closures | 2,272 | 1,899 | 373 | 1,257 | 356 | 0 | 0 |
| tests/cases, `--source-map` | 5,243 | 4,146 | 1,097 | 1,187 | 642 | 0 | 0 |
| tests/cases, `--names` | 5,243 | 4,146 | 1,097 | 1,187 | 642 | 0 | 0 |

The control, a host whose flattening step is told the multi-value step holds nothing, differs
on 4 of 5,243 tests/cases programs, so the question the compiler now answers changes output.

## R6a, the inline-record census, beside the Rust

The inline-record step is too large for one rung, so R6 lands in three: R6a the census, R6b the
walk and the decision with their full explain report, R6c the rewrite and its body moves.
`compiler/opt_inline.vl` exports `optInline`, which reads the staged module through `wmRead`
and answers whether any struct field or array element refers to a leaf record (1 to
`MV_RECORD_MAX_FIELDS` numeric fields, no subtype). When none does it writes the step's
`step skipped` explain line through `optOut` and the host skips the step. Any other module, and
any module the host's scan refuses before its census (a name section naming fields, struct
types in several rec groups, a type with several supertypes, bytes `wmRead` cannot decode), is
handed to the host's `inline_step` unchanged.

`$VL_OPT_INLINE` selects the side: unset or `rust` the host's step alone, `vl` the compiler's
census first, `both` the two, failing the build when the compiler skips a module and the host's
census (`inline::census_rust`) does not say the same line. `opt-parity.sh` now compares the
`$VL_INLINE_EXPLAIN` lines of both sides and counts the programs whose step was skipped.
`VL_OPT_INLINE=rust` against `vl`, on one seed:

| population | programs | identical | both refused | identical with a mark | identical skipping the step | differ | uncompared |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| tests/cases, distilled `cells/` and `named/` | 15,372 | 10,293 | 5,079 | 3,586 | 8,718 | 0 | 0 |
| the same, `-O3` | 15,372 | 10,293 | 5,079 | 3,586 | 8,718 | 0 | 0 |
| tests/cases, `--source-map` | 5,248 | 4,151 | 1,097 | 1,188 | 3,451 | 0 | 0 |
| tests/cases, `--names` | 5,248 | 4,151 | 1,097 | 1,188 | 3,451 | 0 | 0 |

The control, `VL_INLINE_FAULT=1`, makes the compiler skip every module; over tests/cases it
differs on 700 of 5,248 (391 by explain lines alone, 277 by module bytes, 19 by argv, 7 by
escape output, 6 by multi-value output). `tests/selfhost_native_release_inline_test.ts` runs a
skipped program under `vl` and `both`, the fault on each side, and an unknown selector.

The seed grew by 4,561 bytes (0.08%). The Rust stays the default until R6c: a census alone
deletes none of it.
