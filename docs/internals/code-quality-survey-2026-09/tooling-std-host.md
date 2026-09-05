# Code-quality survey — the tooling, std and the host

Every line number is from **`facb9f610`**, the checkout this was measured on (`origin/master`
had moved to `e05d21131` by the time it was written). Every number names the command that
produced it in §9, and every finding carries the gate rows that would prove its fix safe.
Nothing here is a fix; each item is sized so it can be scheduled.

Scope: `compiler/driver.vl`, `cli.vl`, `cli_util.vl`, `lint.vl`, `format.vl`, `fmt_util.vl`,
`entry.vl`, `extents.vl`; `std/*.vl`; `scripts/vl-host/src/main.rs` and
`scripts/wasmtime-host.rs`; `lsp/src/*.ts`; `tests/support/*.ts` and the shape of `tests/*.ts`;
`scripts/*.{sh,py,ts}`. The checker and the emitter are two concurrent surveys and are out of
scope here; three findings below straddle a boundary and say which side owns the fix.

The area is in good repair. The host has **no `panic!`, no `todo!`, and two non-lock
`unwrap()`s** in 5,362 lines; the seed and std resolution ladders are each ONE memoised
function with a named origin that `vl --version` prints; exit codes are a documented table;
`driver.vl`'s 184 exports have **two** that nothing outside the file names. What the survey
found instead is a family: **a fact that exists in two or four places, with a guard for one
pair and none for the others.** The module gate has `tests/module_gate_agreement_test.ts` and
a shared case table; the offset parser, the "where" renderer, the diagnostic column base and
the module surface do not. Six of the top ten are that shape.

---

## 1 · Ranked top ten

| # | finding | value | size | risk | proof |
| --- | --- | --- | --- | --- | --- |
| 1 | `gate.sh`'s per-gate TIME column is a running maximum, not a per-gate time — 19 of 21 rows read the same 80.2 s (§7.1) | the budget CLAUDE.md gates on is unreadable; a slow gate hides behind the slowest | ~6 lines | none | the rows stop being identical; compare against the replica in §9 |
| 2 | the seed anchors on the **CWD**, std on the **EXE's tree** (§3.1) — measured: a worktree pairs its own seed with `/home/verit/vl/std` | the trap CLAUDE.md documents twice and the consumer filed three times (VL-006/007/022) | S–M | low | `vl --version` names one tree; `tests/vl_std_cmd_test.ts`, ci-native |
| 3 | `moduleSurface` omits re-exports (§3.5) — `std:args` reports 1 export, `std:fmt` 5 | 86 of 86 glean files pay the second import the re-export exists to remove | S (driver.vl) | med — the unused-export hint reads the same table | `lsp_auto_import_test.ts`, `lsp_unused_export_wasm_test.ts`, `deno task test` |
| 4 | `vl run`/`vl build` print a **0-based** diagnostic column; `vl check` and `--json` print 1-based (§4.2) | one diagnostic, two positions; a test pins the disagreement | 1 line + test | med — pinned today | `tests/vl_invalid_module_position_test.ts` (must be edited), `vl_check_json_test.ts` |
| 5 | `lint()` walks the whole arena **seven times** and re-splits the source **four** ways (§5.1) | every keystroke in the editor pays it | M | med — merging walks reorders same-position ties | byte-identical `lint-self.sh` output, `vl_comment_budget_test.ts`, `deno task test` |
| 6 | five ratchet scripts, one shape — **41 code lines verbatim in all four** lint ratchets, 134 shared by two (§7.3) | `--why` exists on 2 of 5 though CLAUDE.md asks for it on every one | M | low | every `--check` and `--write-baseline` unchanged; `vl_comment_budget_test.ts`, `vl_kind_ladder_test.ts`, `vl_sentinel_index_test.ts` |
| 7 | the test harness re-declares its footing: `const ROOT` in **59** files, `exists` verbatim in **56**, and **35 of 54** binary-spawning files pin neither `VL_STD` nor the shared helper (§7.4) | a bare `deno test` from a worktree grades the main repo's std | M | low | `deno task test` + ci-native unchanged; `nativeRelease.vl()` gains one env entry |
| 8 | `vl_scaling_shape_test.ts` runs **three times per `gate.sh`**, concurrently with itself, and it is the ratio test (§7.2) | it failed at 2.73/2.50 inside the fan-out and passed alone | S | low | the gate table; the suite's own 9 cases |
| 9 | `lsp/src/*.ts` (9,958 lines) is linted by **nothing** (§8.3) | one standing hit today | S | none | a gate row beside the existing `lsp typecheck` |
| 10 | ✅ **LANDED (§8.1)** — one-entry prepared-state memo in `wasmChecker`, keyed on (source, entryKey, reader, reader generation) | a hover is 1 graph check, not 3; a keystroke burst 2, not 7; 26 modules 4,293 → 1,449 ms | M | med — the key needs the reader's identity AND a host bump | `tests/lsp_prepared_memo_wasm_test.ts`, the whole `lsp_*` family, the `lsp suites (ci list)` gate row |

---

## 2 · std API shape

### 2.1 Exports nothing imports — 23 names, of which 11 are genuinely idle

`scripts/…/tsh-stduse2.py` (§9) resolves `import { … } from "std:x"` across 135 glean `.vl`
files, 2,953 corpus programs, 114 `tests/*.ts` (VL source embedded in TS counts) and 7,903
other tree files. Twenty-three exports are imported by no file outside std. Twelve of them
are not dead:

* `std:test`'s `vltCount`/`vltNameLen`/`vltNameAt`/`vltSkipped`/`vltRun`/`vltFailLen`/`vltFailAt`
  are the runner protocol; `compiler/cli.vl:1360` synthesises
  `export { vltCount, … } from "std:test"` into every compiled `*.test.vl`, and
  `scripts/vl-host/src/main.rs:4064-4206` calls them.
* `std:buffer`'s `"[]"`/`"[]="` and `F32Base`/`I32Base` are resolved structurally, never by
  an import specifier.
* `std:args.Utf8Error` is a re-export the tooling cannot see — §3.5.

The eleven that are idle:

| export | where | note |
| --- | --- | --- |
| `EACCES` `EILSEQ` `EINVAL` `EIO` `EISDIR` `ENOENT` `ENOSPC` `ENOTDIR` `EPERM` | `std/fs.vl:30-38` | nine constants; the live consumer discriminates with `if bytes is IoError` and never reads `.code` (`~/glean/tools/fog-isolate.vl:52`) |
| `IoResult` | `std/fs.vl:22` | the alias `writeFile`/`writeTextFile` return; no caller spells it |
| `afterEach` | `std/test.vl:101` | `describe`/`it`/`beforeEach` are used; this one is not |

None of these is a removal candidate on its own — `E*` is the vocabulary a caller needs the
day it inspects a code, and `afterEach` is `beforeEach`'s twin. The finding is that
**the errno constants have never been exercised end to end**: nothing in the tree proves
`EISDIR` is the number `__fs_size__` actually writes. One corpus case that reads a directory
and compares `err.code == EISDIR` would close that, and is worth more than the nine names.

### 2.2 The gap the consumer had to fill itself: hexadecimal

`std:fmt`'s header says "no radix but ten". Measured in `~/glean`:

* **39 files carry a verbatim copy of `parseHex32`** (e.g. `~/glean/tools/peel.vl`), 13 lines
  each — the largest single duplication in the consumer tree.
* `hex32` / `hex8` (rendering) live once, in `~/glean/src/bytes.vl:63,74`, and are imported
  by the rest.
* `bits32` (`~/glean/src/bytes.vl:104`) exists because a 32-bit pattern with the top bit set
  has no i32 spelling — filed as VL-023, a language item, not a std one.

A `parseI32(self, radix)` would be a second parameter on a name whose current contract is
decimal; the rubric's own precedent (`base64.vl`'s "the URL-safe alphabet … gets its own
name rather than a boolean parameter") argues for `parseHexI32` / `toHexString` instead.
Either way this needs the `std-api-reviewer` and a proposal, not a survey ruling. The
evidence is the 39 copies.

### 2.3 One name, two modules, and the editor picks the wrong one

`lastIndexOf` is exported by `std:array` (`std/array.vl:25`, `self: T[]`) and by `std:str`
(`std/str.vl:97`, `self: string`). `stdAutoImportCompletions`
(`lsp/src/typeFeatures.ts:1646`) walks `[...stdExports.keys()].sort()` and dedupes on the
first hit, so `std:array` always wins. Accepting the completion on a string receiver
produces:

```
no method 'lastIndexOf' for string — the free function `lastIndexOf` takes `self: T[]`
```

(measured; the diagnostic is excellent, the completion is wrong). The completion fires at a
`.`, so the receiver type is available: rank candidates by whether the receiver matches
`self`, or offer both items. LSP-owned, small. Proof: `tests/lsp_auto_import_test.ts` plus one
new case.

### 2.4 What the rubric would pass

Checked and clean, so coverage is distinguishable from silence:

* **No boolean parameters** in any `std/*.vl` export signature.
* **No second error channel** on the surface — every fallible export returns `T | E` or
  `T | null`; `__fs_errno__` is not exported and its deviation is recorded in
  `std-notes.md`, exactly where §4 of the rubric puts a deviation a caller cannot see.
* **No duplicated implementation.** `std:fmt`'s `join`/`repeat`/`split` are re-exports
  (`std/fmt.vl:16`), not copies, and the header says so.
* **Union returns annotate, 16 of 16.**
* `padLeft` (`std/fmt.vl:70`) is the one export whose own doc comment tells callers to use a
  different name (`padStart`). It is a chosen, documented deviation and it stays; recorded
  here only because a std name is permanent and this is the only one of its kind.

### 2.5 A vocabulary asymmetry the checker owns

`compiler/typecheck.vl:8536` maps the typo `size` to `length` for a map receiver, while
`mapMethodNames` (`:8565`) admits **both**. Measured: a two-line program printing
`m.length` and `m.size` prints `1` and `1`. A list and a string admit `length` only. Either
`size` is a real spelling and the suggestion is wrong, or it is not and should be refused —
**checker-owned**, listed here because the consequence is API vocabulary, which is std's
concern.

---

## 3 · The host (`scripts/vl-host/src/main.rs`, 5,362 lines)

### 3.1 The two resolution ladders anchor on different things

Both ladders are single, memoised, well-documented functions — `resolve_compiler_with_origin`
(`:1504-1545`) and `std_source` (`:756-771`) — and `vl --version` (`:279-317`) prints the
origin of each. The surprise is not that they are scattered; it is that they **disagree about
the anchor**:

| | first rung | development rung | anchor |
| --- | --- | --- | --- |
| seed | `--compiler` | `$VL_COMPILER_WASM` → **`./build/vl-compiler.wasm` (CWD, `:1521-1524`)** → the EXE's dev tree → embedded | current directory first |
| std | — | `$VL_STD` → the EXE's dev tree (`:764-767`) → embedded | the binary's checkout, always |

Measured from this worktree:

```
$ ./scripts/vl-host/target/release/vl --version
seed:    build/vl-compiler.wasm (2143263 bytes) — development tree (current directory)
std:     /home/verit/vl/std (11 modules, 9e54d9ec6712e80f) — development tree
```

One command, two trees. The cost is not hypothetical — running the same fault-injected
program twice, differing only in whether `--compiler` named the worktree's seed:

```
# no --compiler: the EXE's dev tree wins, i.e. the MAIN repo's older seed
Error: invalid module
the emitted module failed to validate: type mismatch: … (at offset 0x9a)

# --compiler <worktree>/build/vl-compiler.wasm
Error: invalid module
top.vl:4:0: the emitted module failed to validate inside the module's top-level code: …
```

That is D1594's own repro reading as unfixed. The external consumer filed the same mechanism
three times — VL-006 ("the compiler seed is resolved relative to the current directory"),
VL-007, VL-022 ("the `vl` on PATH pairs a master seed with a `std/` from another branch") in
`~/glean/docs/vl-issues.md`.

**Proposal.** Give `std_source()` a CWD dev-tree rung symmetric with `SeedOrigin::Cwd`, so
both ladders answer "the tree you are standing in" — or, if the asymmetry is deliberate
(a released binary must not read a CWD std), make the MIXED pairing announce itself the way
`$VL_STD` does on a distribution build: one stderr line when the seed came from the CWD and
std did not come from the same tree. Size S either way; the second is safer and catches the
case the first cannot (a CWD with a seed but no `std/`). Risk: an announcement on every dev
invocation is noise — gate it on the two origins naming different directories, which is
exactly the defect. Proof: `tests/vl_std_cmd_test.ts`, `tests/vl_seed_cmd_test.ts`,
`native-fixpoint`, ci-native.

### 3.2 Nine near-identical filesystem import blocks

`register_fs_imports` (`:2972-3316`) registers nine imports, one `if let Some((_, ft)) =
has("…")` block each (`:2989, 2999, 3012, 3047, 3081, 3124, 3160, 3218, 3270`). Every block
repeats the same four moves: clone the errno cell, clone the two GC types, read the path with
`read_u8_list`, and write `errno` on both arms. There are **16 `*e.lock().unwrap() = …` sites**
and **three verbatim copies** of the `os_path` error arm (set errno, return `-code`, `Ok(())`).

The blocks are not identical enough for a macro over all nine, but they factor into two
shapes: *path → i32/i64 status* (`__fs_stat__`, `__fs_size__`, `__fs_write__`) and
*path → `u8[]` with errno* (`__fs_read__`, `__fs_read_range__`, `__fs_list__`,
`__args_get__`). Two helpers taking a closure that returns `Result<Vec<u8>, i32>` /
`Result<i64, i32>` would collapse the errno bookkeeping to one place, which is the part that
matters: an import that forgets to zero `errno` on success reports the *previous* call's
failure, and `std:args` (`std/args.vl:29-34`) already relies on that zeroing for its
`__trap__` to be unreachable. Size M, risk low, emitter-independent. Proof:
`tests/vl_std_fs_*_test.ts`, `tests/vl_std_args_test.ts`, ci-native.

The print family (`instantiate_program:3327-3381`) is seven blocks and is already as tight as
a table would make it; it needs nothing.

### 3.3 The twins with no agreement test

Four facts live in both a VL and a Rust implementation, because `vl build`/`vl run` never
enter the CLI pump:

| fact | VL | Rust |
| --- | --- | --- |
| the offset in an engine message | `engineFailOffset`, `driver.vl:1802-1839` | `engine_fail_offset`, `main.rs:1139-1162` |
| the "where" clause | `emitFnSpanWhere`, `driver.vl:1779-1790` | `SpanWhere::what`, `main.rs:1065-1075` |
| the diagnostic's rendered position | `cli.vl`'s renderers | `render_diags`, `main.rs:1197-1229` |
| the module gate | `cliHasTplHole`/`cliNeedsModules`, `cli_util.vl:207,243` | `has_template_hole`, `main.rs:2054` |

**Only the last one is guarded.** `tests/module_gate_agreement_test.ts` reads all four
implementations, pins them to a shared case table (`tests/support/moduleGateCases.ts`), and
fails if any grows a private twin. Nothing does the equivalent for the other three:
`engineFailOffset` appears in `compiler/*.vl` and in `main.rs` and in **no test file**.

Read side by side, the two offset parsers already differ in two ways, both reachable only
from a malformed message and therefore not live defects: Rust keeps the last occurrence that
**parsed**, VL the last occurrence **at all** (`-1` when the final one has no digits); and
Rust rejects a value above `i32::MAX` while VL's `v = v * 16 + d` wraps. Stated as read, not
run — the VL side is not a wasm export, so a differential harness needs the
`VL_FAULT_INJECT` path rather than a direct call.

**Proposal.** Extend the module-gate pattern: one shared case table of engine messages, one
test that drives `vl check --codegen` and `vl build` over the same fault-injected program and
compares the rendered clause. `tests/vl_invalid_module_position_test.ts` already runs both
sides; it needs the comparison rather than two independent literals (§4.2). Size S, risk none.

### 3.4 The third host is a stale copy that two docs tell you to update

`scripts/wasmtime-host.rs` (410 lines) is in no build and no gate —
`docs/internals/perf-program.md:2437` calls it a "retired spike" and `buffer-design.md:166`
agrees. But `docs/internals/concurrency-design.md:283` and `ROADMAP.md:1231` both list it as
one of the sinks a new print import must land in. It has already fallen behind: `:51-59`
implements `__print_char__` as a **code point** (`char::from_u32` per element), while both
live hosts treat the argument as a **UTF-8 byte** (`main.rs:3369-3376`,
`tests/support/runWasm.ts:136-140`, the "Stage 2c" contract). Every multi-byte character it
prints would read as Latin-1.

Two honest options, both small: delete it and fix the two docs that name it, or give it a
`Cargo.toml` and a gate row. It has one property nothing else has — it is the smallest
complete host, ~410 lines, which is what `ROADMAP` H-M2's WASI shim will be measured against.
That argues for keeping it and gating it. Either way the current state is the worst one: a
file two design docs treat as load-bearing and no instrument reads.

### 3.5 `moduleSurface` cannot see a re-export — and the LSP is its only reader

`modScan`'s re-export arm (`driver.vl:2469-2569`) records `export { a } from "spec"` into
`impMod`/`impSpec`/… and into `reExpMod`/`reExpPublic`/`reExpLocal` (`:2564-2567`). It never
pushes to `expMod`/`expName`/`expDeclLine` — only the *declaration* arm does (`:2578-2588`).
Those are the tables `expNameLen`/`expNameCharAt` (`:2153-2154`) export, and they are what
`lsp/src/wasmChecker.ts:1343-1355` reads. Measured through the seed:

```
std:args surface exports (1): programArgs
std:fmt  surface exports (5): toString padLeft parseI64 parseI32 parseF64
```

`Utf8Error` and `join`/`repeat`/`split` are missing. Three consumers of that table are
therefore wrong about a re-exported name: `stdAutoImportCompletions` never offers it,
`onDocumentSymbol` (`server.ts:616`) does not mark it `export` in the outline, and
`unusedExportHints` (`moduleGraph.ts:765`) has no range for it.

The cost is measurable in the live consumer. `std/args.vl:3` documents the intended import as
`import { programArgs, Utf8Error } from "std:args"`. In `~/glean`, **86 of 86** files that
import `std:args` import `Utf8Error` separately from `std:utf8` — the re-export is taken zero
times, and the mechanism explains it: the editor never offered it.

**Fix (driver.vl, small).** Push each `reExp*` entry into `expMod`/`expName`/`expDeclLine`/
`expDeclCol`/`expKwLine`/`expKwCol`, positioned at the re-export's own name token and
`export` keyword. **Risk, named:** `unusedExportHints` would then consider a re-exported name
for the "export used nowhere" hint, which is a different question for a re-export than for a
declaration. Proof: `tests/lsp_unused_export_wasm_test.ts` (the hint must not fire on
`std:fmt`'s three), `tests/lsp_auto_import_test.ts`, `lsp_document_symbols_wasm_test.ts`,
`deno task test`, the `lsp suites (ci list)` gate row.

---

## 4 · The CLI and the driver

### 4.1 One flag parser, hand-rolled, with five copies of two idioms

`cliParseArgs` (`cli.vl:811-919`) is a 24-arm `else if` ladder. Two idioms repeat:

* the value-flag guard `if i + 1 < cliArgs.length && !cliIsFlag(cliArgs[i + 1])` — **5 copies**
  (`:836, 854, 873, 882, 891`), each with its own usage message.
* the `--flag=value` prefix test with a **hand-counted length** — **5 copies** (`:847, 851,
  863, 888, 897`): `a.length > 11 && a.slice(0, 11) == "--severity="`. A rename means editing
  two numbers that nothing checks agree.

A `cliFlagValue(i, "--severity")` returning the value and the new cursor, plus a
`cliPrefixValue(a, "--severity=")` that derives the length from its own argument, removes
both. Size S, risk low, entirely local. Proof: `tests/vl_check_args_test.ts`,
`vl_check_severity_test.ts`, `vl_check_exclude_test.ts`, `vl_test_cmd_test.ts`.

The host's own flag surface (`value_flags`, `main.rs:224`) is already a table and needs
nothing; it and `cliParseArgs` list the same value-taking flags in two places, which is a
fifth twin for §3.3's list.

**`vl fmt -w` takes one path per run** because `cliFile` (`cli.vl:158`) is a single string and
`:901-905` rejects a second positional:

```
$ vl fmt -w top.vl terr.vl
fmt: unexpected extra argument `terr.vl` (one path per run)
```

`cliFiles` (`:187`) is already a `string[]` work-list, and `ST_CLASSIFY` (`:2100-2110`) already
turns one target into it. The change is a root QUEUE: collect positionals into an array,
classify each, ingest into `cliFiles`. Size M — it touches the state machine, and
`cliCmdPath`/the "cannot read" arms (`:2121, 2174, 2222`) assume one root. Risk low; the
per-file loop below `cliStartWork` is unchanged. Proof: `vl_fmt_test.ts`, `vl_check_dir_test.ts`,
`lint-self.sh` (which runs `vl fmt --check` over the tree).

### 4.2 The diagnostic column has two bases

Same file, same diagnostic, three renderers:

```
vl check --concise  terr.vl: error [1:16] cannot assign string to 'x' of type i32
vl check --json     {"file":"terr.vl","line":1,"col":16,"endCol":19,…}
vl run              terr.vl:1:15: cannot assign string to 'x' of type i32
```

`cli-design.md`'s `--json` spec says `col` is "1-based, inclusive". `render_diags`
(`main.rs:1218`) prints `diagCol` verbatim, and `diagCol` is 0-based (the contract is stated
at `lsp/src/wasmChecker.ts:1377`). `locate_invalid_module` (`main.rs:2321`) does the same, which
is why D1594's banner reads `top.vl:4:0` while the pump's caret reads `at top.vl:4:1`.

The divergence is **pinned**: `tests/vl_invalid_module_position_test.ts:135/146/157` asserts
`take.vl:1:10` for `check --codegen` and `take.vl:1:9:` for `run` and `build`, with no comment
on why they differ. Fix is `col + 1` at both host sites plus the test's literals. Size S; risk
medium precisely because the test encodes the current behaviour — anything scraping `vl run`
stderr moves by one. Proof: `vl_invalid_module_position_test.ts`, `vl_check_json_test.ts`,
`vl_compiler_trap_banner_test.ts`, ci-native.

### 4.3 Rendered twice, in the same function

`cliFinishSummary` computes the exit code twice — `cli.vl:1291-1293` in the `--json` arm and
`:1342-1344` at the end:

```vl
cliExit = 0
if cliGating > 0 { cliExit = 1 }
if cliInvalidModule > 0 { cliExit = 70 }
```

A fourth condition has to be added in both. One `cliCheckExit()` helper called once from each
arm. Two lines of change; no risk; the same shape D1601 fixed for `cliStdHiddenNote`. This is
the only thing in the check path rendered twice — the `--fix` note, the std-hidden note and
the severity gate each have one owner.

### 4.4 Exit codes: checked, clean

Every failure class maps to a code and the table is in `cli-design.md` §"Exit codes, and which
module trapped": 0 / 1 / 2 / 3 / 70. `cliExit` is written at 22 sites in `cli.vl`, all of them
one of those five; the host exits 2 at nine usage sites and 70 through `EXIT_COMPILER_BUG`
(`main.rs:5115`). Attribution is recorded at the call boundary (`from_compiler`/`from_user`),
not read off the message. Nothing to change.

---

## 5 · `lint.vl` (4,243 lines)

### 5.1 Seven walks of the arena, four splits of the source

There is a shared walker — `lintWalk` (`:723-737`) drives `nodeChildren`, and the header at
`:706` says so. But the rule id is a *parameter*, so `lint()` calls it **seven times**
(`:166-172`), once per structural rule. Each pass re-walks every node and allocates a fresh
`i32[]` from `nodeChildren` at every node: seven traversals and 7 × N allocations where one
traversal and N would do.

The dispatch inside it is also a mixed `if` / `else if` chain: `:724-726` are three bare
`if`s, `:727-730` an `if`/`else if` chain starting at `lintRuleUnionLetNoMelt`. It is correct
today, and a rule inserted into the chain rather than appended before it would not be.

Four text rules do not use the walker at all, and each opens its own line loop over the same
`cbSource`: `commentBudget` (`:2151`, splitter at `:2175`), `stdCommentAudience` (`:2398`,
`:2415`), `arenaScanLint` (`:2632`, `:2640`), and `klIndexLines` (`:2986`, `:2992`) — four
verbatim copies of

```vl
while e < s.length && s[e] != '\n' { e = e + 1 }
let le = e
if le > i && s[le - 1] == '\r' { le = le - 1 }
```

and three of the leading-whitespace skip that follows it. `klIndexLines` + `klIndexFns` are
then built **twice** per lint — `kindLadderLint` (`:3602`) and `sentinelIndexLint` (`:4233`) —
deliberately, so neither pass depends on running after the other (`:4227-4229` says so).

**Proposal, in two independently shippable halves.**
*(a)* One `lintVisitAll(ix)` that calls all seven visitors, driven by one `lintWalk(progRoot)`.
**Risk, named:** the emit order changes, and `:157-159` records that emit order only breaks
same-position ties. If the corpus diagnostics are not byte-identical, the tie-break needs an
explicit key rather than the walk order.
*(b)* A `klEnsureIndex(s)` that rebuilds the line/function index only when `s` differs from the
last indexed source, keeping both passes order-independent, and one shared line iterator the
four text rules take.

Size M for each half; risk medium for (a), low for (b). Proof: byte-identical `lint-self.sh`
output over `compiler/`, `python3 scripts/comment-budget.py --check`, `ladder-budget.py
--check`, `sentinel-budget.py --check`, `scan-budget.py --check`,
`tests/vl_comment_budget_test.ts`, `vl_kind_ladder_test.ts`, `vl_sentinel_index_test.ts`,
`deno task test`.

**Both halves landed 2026-09-05, and (a)'s named risk was real.** A `let` that is both the
first unreachable statement of its block and a boxing union-`let` in a loop anchors
`unreachable-code` and `union-let-no-melt` on one token, and the single walk reaches the
`while` before its block — built with the regroup out, the pair swaps. `lintRegroupWalkPhase`
therefore gives the tie an explicit rank per code rather than letting walk order decide it,
and `tests/vl_check_module_lint_test.ts` pins the pair. Measured in paired CPU milliseconds
over 25 triples: the single walk is −5.2% to −6.7% of a whole `vl check`, and the shared index
a further −0.9% to −2.7%, which on the box that measured it is the noise floor. §5.2 was not
attempted.

### 5.2 Four text-scanner families over one string

`lint.vl` carries five helper families with disjoint prefixes and overlapping jobs: `cb*` (32
functions), `kl*` (29), `si*` (24), `sca*` (7), `as*` (6). Each has its own word-at,
ident-end, whitespace-skip and span-compare primitives over the same `cbSource`. That is
~2,100 of the file's 4,243 lines, and the per-rule sections are 22–540 lines each with the
boilerplate share concentrated in the scanners rather than in the rules.

This is a consequence of (5.1)(b), not a separate item: once a shared line index and a shared
line reader exist, the five families collapse toward one. Listed separately so the size is
honest — the scanners are what makes `lint.vl` 4,243 lines, and no single PR should try to
merge them.

---

## 6 · What the survey did not find

Recorded so coverage can be told from silence.

* **Dead exports.** `driver.vl` 184 exports, `cli.vl` 26, `cli_util.vl` 26, `format.vl` 4,
  `fmt_util.vl` 34, `extents.vl` 12, `entry.vl` 0. Two are named nowhere outside their own
  file: `vcSource` (`driver.vl:284`) and `emitFnSpanName` (`:1756`) — the latter is reachable
  only through its own `…Len`/`…At` pair and could lose the `export` keyword. That is the
  whole list.
* **Orphaned scripts.** Of 35 files directly under `scripts/`, one — `p7-eq.sh` — has its name
  in no other file in the tree. `perf-program.md:3158-3163` keeps the `p7-*` family
  deliberately and describes what `p7-eq.sh` does ("identical before timing anything") without
  naming it. One word in that sentence closes it.
* **`unwrap` on user-controlled paths.** 32 `.unwrap()` in `main.rs`, **30** of them
  `lock().unwrap()` (mutex poisoning). The other two are `c[l*8..l*8+8].try_into()` on a
  slice the loop bounds (`:1298`) and an index the same function assigned (`:3997`). Three
  `.expect()`, all on Rust's own `{:e}` formatting. No `panic!`, `unreachable!` or `todo!`.
* **The `--json` renderer.** One owner per field; nothing about a diagnostic is built twice
  in `cli.vl` except §4.3's exit code.

---

## 7 · The gate ladder, the ratchets and the test harness

### 7.1 The per-gate TIME column is a running maximum

`gate.sh:41` stamps each job's start into `STARTS[]`, and `:130-131` computes elapsed as
`now - STARTS[i]` **after** `wait "${PIDS[$i]}"` in index order. `wait` on a job that already
finished returns immediately, so every row after the slowest reports the loop's current wall
clock rather than its own. A full run on this box:

```
deno task test            67.9s  ok
ci-native                 80.2s  ok
lsp suites (ci list)      80.2s  ok
… 17 more rows, all 80.2s …
distilled corpus          80.2s  ok
```

Nineteen of twenty-one rows read the same number. A replica whose timing is taken **inside**
the subshell, same commit, same flags, load 52 → falling:

| gate | own time | | gate | own time |
| --- | ---: | --- | --- | ---: |
| ci-native | **74.9 s** | | mono-tyaram-grid | 30.5 s |
| distilled corpus | **65.3 s** | | self-compile time | 23.4 s |
| deno task test | **63.5 s** | | lsp suites (ci list) | 12.1 s |
| scaling shape | **60.2 s** | | lint-self + fmt | 11.3 s |
| filed witnesses | 47.9 s | | comment / kind-ladder / sentinel budgets | 6.3 / 6.5 / 6.5 s |
| native-fixpoint | 46.1 s | | the other seven rows | ≤ 1.5 s each |

Wall 74.9 s for 459 s of summed work; `scripts/refresh-compiler.sh` adds **15.1 s wall /
30.2 s user** on an idle box, so a full `gate.sh` is ~90 s. **ci-native is the critical
path** — nothing else on the list changes the wall clock until it moves. CLAUDE.md's
"68 seconds for all nine" is a reading of the broken column and describes nine rows that are
now twenty-one; it should be re-derived from a fixed table.

Fix: `run()` records the finish time in the subshell (`echo "$el $rc" > "$LOGS/$i.t"`) and the
report reads it. ~6 lines, no behaviour change, exit codes untouched.

### 7.2 The ratio test runs three times, concurrently with itself

`tests/vl_scaling_shape_test.ts` matches `tests/` (the `deno task test` row), matches
`tests/vl_*_test.ts` (the `ci-native` row), and has its own `scaling shape` row. All three run
in the same fan-out: its nine test names appear in logs 0, 1 and 12 of one gate run. It is the
one gate whose verdict is a **time ratio**, and three copies of it are three copies of the
contention that moves the ratio.

Measured, same commit, same box:

* inside `gate.sh`'s fan-out — `functions: … cost 5.287s against 1.939s (ratio 2.73, bar 2.50)`,
  **FAILED**, 57 s;
* run alone — 9 passed, 39 s, `functions` 4 s.

One data point each, so this is a reproduction of the failure mode rather than a flake rate.
The cheap fix is to exclude the file from the two glob rows (`deno task test` and ci-native
both already exclude nothing, so this needs a `--ignore`), leaving the dedicated row that
exists to run it. Size S; risk low, but ci.yml's own ci-native step runs the same glob, so the
exclusion has to land in both or `ci_seed_coverage_test.ts` will notice. Proof: the gate table,
and the suite's own 9 cases still running once.

### 7.3 Five ratchets, one shape

| script | lines | flags |
| --- | ---: | --- |
| `comment-budget.py` | 500 | `--check --list --write-baseline --exempt-codes --filter-lint --grade` |
| `ladder-budget.py` | 352 | … `--why --short` |
| `sentinel-budget.py` | 271 | … `--why --short` |
| `scan-budget.py` | 271 | `--check --list --write-baseline --exempt-codes` |
| `seed-size.py` | 146 | `--check --short --write-baseline --baseline --seed` |

Ignoring blanks and comments and collapsing each script's own name, **41 distinct code lines
appear verbatim in all four lint ratchets** — `load_baseline`, `write_baseline`, `cmd_check`,
`cmd_exempt_codes`, `main`, the `{file: {code: count}}` schema, the
`"  python3 scripts/<self>.py --write-baseline"` remedy line, and the `BASELINE`/`ROOT`
constants. `ladder-budget` and `sentinel-budget` share **134** of the smaller one's 217
distinct lines (62%), including the whole `tree_at(commit)` git-archive helper.

Consequence, not just tidiness: **`--why` exists on two of five.** CLAUDE.md says "every
ratchet with a baseline should be able to" name what left since the baseline's commit, and
`comment-budget`, `scan-budget` and `seed-size` cannot.

**Proposal.** `scripts/ratchet.py` exposing `Ratchet(baseline_path, codes, current_fn,
tree_at_fn)` with `--check/--list/--write-baseline/--exempt-codes/--why/--short`; each script
keeps its census and becomes a ten-line front end. Removes ~400 lines and gives `--why` to
all five. Size M, risk low — every baseline file and every exit code stays byte-identical.
Proof: each `--check` still passes on an unchanged tree and still fails on a seeded regression;
`tests/vl_comment_budget_test.ts`, `vl_kind_ladder_test.ts`, `vl_sentinel_index_test.ts` pin
the lint and the script to agree hit by hit and are the real gate here.

### 7.4 The test harness re-derives its own footing in every file

Across 108 `tests/*.ts`:

| declared privately in | files |
| --- | ---: |
| `const ROOT` | 59 |
| `const VL` | 54 |
| `const COMPILER` | 53 |
| `const SEED` | 30 |
| `const exists = (p: string): boolean => { … }` **verbatim** | 56 |

`tests/support/nativeRelease.ts:79-96` already exports all of them, and
`tests/support/viewBoundsShape.ts:61-87` is a second private copy of the same block. **Four**
files import `nativeRelease.ts`.

The consequence is not only duplication. **54 files spawn the native binary; 35 of them pin
neither `VL_STD` nor import the shared helper.** `VL_STD` is exported by exactly two files in
the tree — `scripts/gate.sh:28` and `scripts/native-corpus-sweep.sh:34` — so a bare
`deno test -A tests/vl_check_dir_test.ts` from an agent worktree spawns a binary whose
`std_source()` resolves `/home/verit/vl/std` (§3.1), and grades the wrong std silently. CI is
unaffected only because there the EXE's dev tree *is* the checkout.

**Fix, small and structural:** `nativeRelease.vl()` (`:627`) sets `VL_STD: ROOT + "/std"` by
default, where `ROOT` is derived from `import.meta.url` — the tree the *test file* lives in,
which is the right anchor. Then migrate spawners onto it. Size S for the helper, M for the
migration (mechanical, one file at a time). Risk low. Proof: `deno task test` and ci-native
unchanged; the seven files that already set `STD` explicitly keep their override.

### 7.5 Where `deno task test` spends its 63.5 s

5,808 tests, 118.2 s of summed reported time under `--parallel`. **33 tests hold 66% of it**
and 87 hold 77%. By file:

| file | summed | tests | mean |
| --- | ---: | ---: | ---: |
| `vl_scaling_shape_test.ts` | 32.1 s | 9 | 3,563 ms |
| `vl_buffer_view_bounds_shape_test.ts` | 21.0 s | 18 | 1,167 ms |
| `vl_buffer_view_bounds_contract_test.ts` | 12.0 s | 1 | 12,000 ms |
| the four `cases_wasm_*` shards | 27.8 s | 2,356 | 12 ms |
| `lsp_undisplayable_type_test.ts` | 6.2 s | 7 | 879 ms |

Every one of the heavy files is *doing real work* — compiling programs and disassembling
modules — so this is not the "100 ms for reasons other than the work" class the corpus oracle
was. The one exception is §7.2: 32 s of it is a suite running for the third time.

---

## 8 · The LSP

### 8.1 A hover is up to three full module-graph checks

**Landed.** `wasmChecker` holds ONE memo entry — the (source, entryKey, reader,
reader generation) the seed instance is staged for, and whether `checkSrcSym` has
run over it — and every query goes through `ensurePrepared`. Measured with the
`graphCheckCount()` instrument the change adds (graph checks / module fetches per
request): `onHover` **3 → 1** / 3 → 1, `onDocumentHighlight` **2 → 1** / 2 → 1,
`semanticTokens` **2 → 1** / 2 → 1, `onDefinition` 1 → 1 / **2 → 1**, and one
keystroke burst (change + hover + tokens + inlay) **7 → 2** / **7 → 1**. The
keystroke ladder, medians of three interleaved runs per arm at load 12: 1 module
0.3 → 0.1 ms, 4 modules 3.0 → 1.0 ms, **26 modules 4,293 → 1,449 ms (2.96×)**,
with the second hover in the same unchanged file at **8.7 ms**. (The same ladder
at load ~100 reads 4,995 → 1,961 ms, 2.55× — the ratio is the column that
survives the box.) What remains is one staging (~100 ms) plus one `checkSrcSym`
(~1.3 s), which is §C2's per-module checked-form cache, not this.

The rest of this section is the survey's own finding, at the commit it names.

`prepare()` (`wasmChecker.ts:652-686`) resets the module table, re-commits **every** module in
the graph, and re-pushes the source; the sixteen methods that call it then run
`exp.checkSrcSym()`. Nothing memoises the prepared state — there is no `lastSource` /
`lastEntry` guard anywhere in the file.

Per request, counted from `server.ts`:

| handler | full graph checks | why |
| --- | ---: | --- |
| `onHover` `:878` | up to **3** | a fall-through ladder: `hoverTypeAt` → `memberTypeAt` → `typeAliasAt`, each rung firing only if the previous had no answer |
| `onDocumentHighlight` `:540` | **2** | `referencesAt` then `definitionAt`, same position, same unchanged text |
| `semanticTokens` `:1007` | **2** | `tokensAt` then `memberTokensAt` |
| `onCompletion` `:1233` | **2** | `memberCompletionsAt` + `scopeAt` |

§C2 of `perf-opportunities-2026-09.md` measures a graph check at 9 ms (no imports), 31 ms
(`std:json`+`std:fmt`) and **4.427 s** (`compiler/entry.vl`, 26 modules). Hovering a user type
name in a compiler file is therefore three of those.

**Proposal.** A one-entry memo in `wasmChecker`: key `(entryKey, source, readerGeneration)`,
value "the instance is prepared and `checkSrcSym` has run". Every method becomes
`await ensurePrepared(...)`. Size M. **Risk, named:** the key must include something that
changes when a *dependency* changes on disk, or a cross-file edit goes stale — hence
`readerGeneration`, bumped by `documents.onDidChangeContent` and by the workspace pass. This
composes with, and does not replace, §C2's per-module checked-form cache. Proof: the whole
`lsp_*_wasm_test.ts` family and the `lsp suites (ci list)` gate row, plus a keystroke ladder
at 1 / 4 / 26 modules of the kind §C2 asks for.

### 8.2 The flat/nested symbol seam is complete

`onDocumentSymbol` (`server.ts:609-647`) uses `nestedDocumentSymbols` when `declExtentsAt`
returns extents and falls back to `flatDocumentSymbols` when it does not. The comment at
`:619-621` states the ambiguity (older seed vs no declarations) and why it costs nothing, and
`tests/lsp_document_symbols_wasm_test.ts` exercises both paths directly. Nothing left half
done. The one thing the seam inherits is §3.5: `exportedNames` comes from `moduleSurface`, so
a re-exported name is not marked `export` in the outline.

### 8.3 Nothing lints `lsp/src/`

`deno.json`'s top-level `"exclude": ["lsp", "reference", ".claude"]` removes the directory from
`deno lint` — including when the path is named explicitly:

```
$ deno lint lsp/src/server.ts
{"version":1,"diagnostics":[],"errors":[],"checked_files":[]}
```

`gate.sh` has an `lsp typecheck` row (`deno check --node-modules-dir=none --config
lsp/deno.json lsp/src/*.ts`) but no lint row, and CLAUDE.md's gate item 3 warns about the
opposite hole (a `.ts` edit passing every gate but `deno lint`). The exclusion is not vacuous
— running the linter with the LSP's own config finds one standing hit:

```
error[no-unused-vars]: `LexToken` is never used
  --> lsp/src/testDiscovery.ts:48:15
Found 1 problem. Checked 12 files
```

Fix: one `run "lsp lint" deno lint --config lsp/deno.json lsp/src/` row in `gate.sh` and the
matching CI step, plus the one-line fix. Size S, risk none.

---

## 9 · What I measured, and how

Every command was run from a worktree at `facb9f610` with `node_modules` and
`scripts/vl-host/target` symlinked to the main repo's, after `bash scripts/refresh-compiler.sh`.
Box: 24 cores, 47 GiB; the load at the time is quoted where it matters. Scratch scripts are
throwaway and reproduced by the descriptions below; nothing in the repo was modified.

**The gate ladder.** `JOBS=6 DENO_JOBS=4 bash scripts/gate.sh --no-build` (load 115 → 52) for
the shipped table; then a read-only replica of the same fan-out whose `run()` writes
`"$(date) - $start"` and the rc into `$LOGS/$i.t` from **inside** the subshell, and whose
report reads those files, for the per-gate column in §7.1. `scaling shape` alone:
`deno test -A --no-check tests/vl_scaling_shape_test.ts` (load 115, 39 s, 9 passed). Seed
build: `/usr/bin/time -f … bash scripts/refresh-compiler.sh` (load 2.06).

**Test timings.** The `deno task test` and `ci-native` logs from the replica run, parsed for
`^(\./tests/x.ts => )?name \.\.\. (ok|FAILED|ignored) \((\d+)(ms|s)\)` and bucketed by file.
Under `--parallel` these are wall times including contention — read the ranking, not the
absolutes.

**std usage.** A Python scan resolving `import { … } from "std:x"` (with `as` aliases) over
135 `.vl` files in `~/glean/{src,tools,vl-probes}`, 2,953 under `tests/cases` + `tests/fixtures`,
114 `tests/*.ts` (VL embedded in TS counts), and 7,903 files under `compiler/`, `examples/`,
`bench/`, `playground/`, `scripts/`. `std/embedded.ts` and `std/` itself excluded. Export names
come from `^export (function|const|type)` plus the multi-line `export\n  function` form plus
`export { … }` re-export lists in `std/*.vl`.

**The re-export miss.** A Python scan over the same glean directories counting files that
import `std:args` and separately import `Utf8Error` from `std:utf8`: 86 of 86, 0 either way
alone.

**`moduleSurface` and auto-import.** A Deno script instantiating `build/vl-compiler.wasm`
through `lsp/src/wasmCheckerNode.ts`'s `loadWasmChecker`, calling `moduleSurface(src, key)` for
each std module and feeding the result to `stdAutoImportCompletions` from
`lsp/src/typeFeatures.ts`. It printed the export lists quoted in §3.5 and the duplicate-name
table in §2.3.

**The `lastIndexOf` hazard.** A four-line program importing `lastIndexOf` from `std:array` and
calling it on a `string`, run with `VL_STD` and `--compiler` both pinned to the worktree.

**Diagnostic columns.** `vl check --concise`, `vl check --json` and `vl run` over the same
two-line file, all three with `VL_STD` and `--compiler` pinned. The invalid-module banner:
`VL_FAULT_INJECT=corrupt-start-fn-body vl build` and `vl check --codegen` over D1594's own
witness, once with `--compiler` pinned to the worktree and once without — which is also the
measurement in §3.1.

**Map vocabulary.** `const m = Map(); m.set("a", 1); print(m.length); print(m.size)` →
`1` / `1`.

**Counts in source.** `command grep -c` on single files for the host's registration blocks,
`unwrap`/`expect`/`panic`, `cli.vl`'s parser idioms and `lint.vl`'s splitters and walks;
Python for anything recursive. **The shell's `grep` here is a wrapper around `ugrep
--ignore-files` and silently skipped a tracked file** (`tests/vl_std_base64_test.ts`) in three
different invocations, once producing a wrong "zero consumers" list that this document does
not contain. Every count above was re-derived with `command grep` or Python; treat a bare
`grep` in this tree as unverified.

**Ratchet overlap.** A Python set-comparison over the five scripts' non-blank, non-comment
lines with each script's own name collapsed to a placeholder, reporting pairwise
intersections and the four-way intersection.

**Test harness.** A Python walk of `tests/*.ts` counting private `const ROOT|VL|COMPILER|SEED|
STD|WASM_OPT|WASM_DIS` declarations, verbatim `exists` helpers, files containing
`target/release/vl`, and of those, files containing neither `nativeRelease.ts` nor `VL_STD`.

**LSP per-handler cost.** A Python pass extracting the `wasmChecker.ts` methods whose body
contains `await prepare(exp` (16 of them), then counting `.<method>(` call sites inside each
`connection.on…` region of `server.ts`. The four handlers quoted in §8.1 were then read
directly, because the region boundaries are approximate.

**Dead exports and orphan scripts.** A Python pass over every `.vl/.ts/.rs/.py/.sh/.json/.md/
.yml/.mjs` file outside `.git`, `node_modules`, `target`, `build`, counting occurrences of each
`export function` name in my eight compiler files and each `scripts/*` basename.
