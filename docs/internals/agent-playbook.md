# Parallel-agent playbook (selfhost parity slices)

The standing rules for worktree-isolated agents working on `compiler/*.vl`
native↔host parity. Launch prompts should reference this file and add only:
the capability, the file scope, the target corpus bucket, and any
subsystem-avoidance notes.

## Mission invariants
- Preserve language semantics: the corpus goldens and each case's `@log` oracle
  are the spec. Fix/extend behavior inside `compiler/*.vl`; never change what the
  language accepts or emits. (The former TS host that once served as the spec
  oracle is retired — ROADMAP "Kill the TS host. DONE".)
- ~~**Golden-neutral**: `git status tests/golden/` must be empty at every commit.~~
  **STALE — `tests/golden/` NO LONGER EXISTS in this tree** (verified 2026-08-03).
  An agent gating on it gets a vacuous pass and thinks it checked something. The
  live equivalents are the corpus A/B (six channels, RUN identical after
  normalizing `0x<hex>`) and the golden tables inside
  `tests/selfhost_native_release_test.ts` (`MELT_TABLE`, the loop-shape rows) —
  those ARE real pins and moving one needs its justification in the same commit.
- **Self-hosting constraint**: the `.vl` files compile themselves — only use
  language features the current native compiler supports; mimic file style.
- **One namespace**: all `compiler/*.vl` share a single namespace in the
  concatenated build — grep before adding any top-level name.
- **Reject-parity**: a change that makes the checker accept more must keep every
  case that rejects today rejecting. ~~`REJECT_CASES`~~ **that named list NO
  LONGER EXISTS** (`grep -rln REJECT_CASES tests/ scripts/` returns nothing) —
  gating on it is the vacuous pass this file warns about two bullets up. The live
  equivalents are the corpus `@error` cases adjudicated by
  `tests/cases_wasm_test.ts`, and the REJECT tier of
  `tests/selfhost_native_align_test.ts`, which discovers its members rather than
  listing them.

## Work discipline
- Recon is capped: be editing within ~15 tool calls.
- Commit after EVERY completed cluster — incremental commits are crash
  protection. Do not push; do not open PRs (the orchestrator integrates).
- Never commit `scripts/vl-host/target` or `node_modules` (setup symlinks).

## Setup (first thing, from the worktree root)
    bash scripts/agent-setup.sh
Re-run `bash scripts/refresh-compiler.sh` after every `compiler/*.vl` edit.

## Iteration loop
    scripts/vl-host/target/release/vl check <file> --compiler build/vl-compiler.wasm
    scripts/vl-host/target/release/vl run   <file> --compiler build/vl-compiler.wasm
A file is PROMOTABLE only when check passes AND run stdout exactly equals
`sed -n 's|^// @log ||p' <file>`. Promote by adding it to
`tests/selfhost_native_align_test.ts` (both its `WHITELIST` and `RUN_CASES`
lists). A file that advances to a
later failure stage is progress to report, not promote.

To diagnose invalid emitted wasm. **CHECK WHICH DISASSEMBLER YOU HAVE FIRST** —
`wasm-tools` is the better tool (spec-grade, full WasmGC, byte-level `dump`; see
docs/internals/wasm-toolchain-audit.md §3) but it is NOT guaranteed present, and a
playbook that assumes it sends you down a dead path at the moment you are already
debugging something hard.

    vl build <file> --compiler build/vl-compiler.wasm -o /tmp/x.wasm

`vl build` already validates through the engine and exits 1 on a reject, so the
build's own stderr is the first read. For the disassembly:

    command -v wasm-tools >/dev/null && echo have-wasm-tools || echo use-binaryen

    # with wasm-tools (preferred):
    wasm-tools validate --features all /tmp/x.wasm   # precise byte offset + reason
    wasm-tools print /tmp/x.wasm                     # WAT — READ the offending function
    wasm-tools dump /tmp/x.wasm                      # byte-level section/LEB framing when too
                                                     # malformed for the disassembler to parse

    # fallback, always present after `npm ci` (it is what ships `wasm-opt`).
    # THE FEATURE FLAGS ARE MANDATORY — see the trap below.
    F="--enable-reference-types --enable-gc --enable-bulk-memory --enable-tail-call"
    node_modules/.bin/wasm-dis $F /tmp/x.wasm -o /tmp/x.wat
    node_modules/.bin/wasm-opt $F -O3 /tmp/x.wasm -o /dev/null   # rejects ⇒ actually invalid

**BINARYEN WITHOUT THOSE FLAGS FALSELY REJECTS EVERY VL MODULE.** Bare `wasm-opt`
on a module the engine just validated reports `[wasm-validator error in function 0]
unexpected false: all used types should be allowed` and `Fatal: error validating
input` — the GC types are not enabled by default. That is a FALSE POSITIVE on the
very diagnostic you are debugging with, and it says "invalid" about bytes that are
fine. The flag list is the host's own (`main.rs`, the `-O` path); keep them in sync.

Binaryen's reader is also not spec-grade and has no `dump`, so a module too
malformed to disassemble needs `wasm-tools`; install it before concluding the bytes
are fine.
For a trap, disassemble and trace the faulting function; for a mismatch, diff the
WAT of the value's write path vs read path. Don't debug codegen blind against the
validator message alone — the disassembly is the debugging view of `vl build` output.

## Trimmed gates (CI covers the full battery)
- **The seed ladder has TWO legs, and a self-built seed only satisfies one.**
  `scripts/refresh-compiler.sh` rebuilds from your own sources, which proves the
  seed matches the source and catches a STALE seed. It cannot catch a seed too
  OLD to compile source that relies on a fix the source ships — because the seed
  you built already contains that fix. CI bootstraps from the published
  `seed-latest`, which is MASTER's compiler, so the second leg is:

      mv build/vl-compiler.wasm /tmp/keep.wasm
      bash scripts/fetch-seed.sh
      bash scripts/refresh-compiler.sh --prove-fixpoint

  Run it before opening any PR that touches `compiler/*.vl`. When it fails and
  the self-built ladder passes, the change is a BOOTSTRAP ORDERING problem, not a
  defect: split it into the fix, and the use of what the fix enables, separated by
  a seed republish (`seed-latest` republishes on every master push — verify the
  hash changed, never assume the job finished).
- **`npm ci` is load-bearing for the gate, not just the build.** The six
  `selfhost_native_opt` (`vl build -O`) tests gate on
  `node_modules/.bin/wasm-opt` and SELF-IGNORE when it is absent — silently, as
  **six extra "ignored"** rather than any failure. A whole slice of new store
  opcodes shipped having never once been through `-O` for exactly this reason.
  **Read the ignored COUNT before reading the pass count**: six more than the
  branch's baseline means binaryen is missing, not that anything changed. Diff the
  ignored NAME SET against the baseline with both files asserted non-empty — an
  empty-vs-empty diff is clean and means nothing, which has happened here.
- Per commit, if the checker got more permissive: `deno test -A
  tests/cases_wasm_test.ts` (the `@error` cases) plus the align suite's REJECT
  tier. Not "the REJECT_CASES loop" — see the reject-parity bullet above.
  (~~`git status tests/golden/` empty~~ — that directory is GONE; see above.)
- ~~Before finishing: `deno test -A --no-check tests/selfhost_emit_fixpoint_test.ts`
  must be 14/14.~~ **STALE — that file NO LONGER EXISTS** (verified 2026-08-03).
  The fixpoint is gated by `bash scripts/refresh-compiler.sh --prove-fixpoint`
  and `bash scripts/native-fixpoint.sh` (stage3 == stage4 byte-for-byte); check
  REFRESH_RC explicitly, because refresh's failure tail READS LIKE SUCCESS.
  Still read real output (`grep -E "passed|failed"`), never `tail -1`.
- If you add an `is <Node>` narrowing on a new node type, OR call any
  `ast.vl` helper (`mk*`, etc.) not already imported there, add it to the
  import list in `tests/selfhost_wasm_emit_test.ts` and RUN that test —
  three slices have now tripped on this.

## Known landmines
- **`@error-at` directive lines are 0-BASED, and the COLUMN is never compared**
  (line-only matching) while the CLI prints 1-based. An off-by-one here passes
  silently in one direction and fails confusingly in the other.
- **A `redundant type annotation` HINT can be wrong about a load-bearing
  annotation.** The monomorphizer binds a generic alias by NAME, so deleting an
  annotation the checker calls redundant can turn a working program into an emit
  error. Verify by building before acting on that hint in generic code.
- When a slice makes something START WORKING, grep the test suites for stale
  negative tests asserting it fails (`fails loudly`, `err:`, REJECT lists) and
  flip them — two CI failures came from obsoleted expectations.
- **A parallel sweep must not append to one shared file.** A single-line `>>` is
  atomic only up to `PIPE_BUF`; a record carrying a long multi-line diagnostic
  exceeds it and TEARS, which drops a file from one side of an A/B and invents a
  fragment on the other. A torn record hides a real difference as easily as it
  invents one. Write one file per worker and concatenate, and assert
  well-formedness (line count == records matching the expected leading field) so
  a tear is loud instead of an A/B artifact.
- **A sabotage harness for a self-hosting compiler must restore a SAVED artifact,
  never rebuild one.** `refresh-compiler.sh` self-compiles, so restoring after a
  sabotage compiles clean source WITH the sabotaged compiler. If the sabotage
  breaks a construct `compiler/*.vl` itself uses, the "restored" seed is
  miscompiled and every later run measures against it. The tell is
  IMPLAUSIBILITY, not failure — a sabotage of a host-side float formatter cannot
  redden a map test. Only the sabotage's own build may recompile.
- The FNV constant `0 - 2128831035` in wasmEmit.vl is deliberately
  hand-wrapped for i32 hash semantics — not a bug.
- The type-index oracle formulas (`mAssignTypeIndices` + `*OffsetOf`) are a
  shared chokepoint: interning new heap types means appending a new
  usage-gated offset function, never reordering existing ones.
- Map/list/set/closure struct layouts are rep changes — out of agent scope.
- A new corpus `@error`/`@run` case whose verdict the WASM oracle reaches by a
  different message — or that the native emitter loud-rejects while the host
  accepts (the native long tail) — must be registered in
  `tests/cases_wasm_test.ts`'s `EXPECTED_DIVERGENCES` IN THE SAME PR. Skipping
  this turns master red the moment the case merges (the slice-0 intrinsics
  corpus did exactly this — 5 cases red on master until #358). Run
  `deno test -A tests/cases_wasm_test.ts` before opening any corpus-adding PR.
- **A `$fnsig` interning KEY that is coarser than the `$fnsig` BYTES is a
  miscompile, not a missed dedup.** The bytes for a `$fnsig` slot come from the
  key's REPRESENTATIVE function (`cloSigRepFn` → `cloRetValKind`), not from the
  key, so two functions sharing a key get one slot whose result type is whichever
  of them interned it FIRST — and `emitFunctionSection` declares the loser with the
  winner's functype while its body emits its own. Declaration ORDER decides which
  one is invalid, and the two victims report MIRRORED errors, which is the cheapest
  way to confirm the mechanism. A live instance: `cloRetKindOf` folds an
  un-annotated `string | null` (`nulstr`) return into the i32 result token, so any
  i32/boolean-result function sharing its param spine collides (6 of 272 ordered
  result-kind pairs; the annotated spelling is always clean). Whenever a key
  producer and a byte producer for the same table are separate functions, the
  invariant "every function sharing the key has byte-identical kinds" has to be
  MEASURED, not asserted in a comment.
- **The fuzzer's grammar never emits a nested named function that captures**, so a
  fuzz A/B is structurally blind to `emitCapturedCall` — a sabotage there is inert
  across 25,200 programs. The corpus reaches it in exactly 2 of ~1,417 files
  (`functions/closure.vl`, `numerics/error-intrinsic-with-fn-value.vl`), and only
  the first can move a row. For anything on that path, construct the population.
- **Capture analysis is name-keyed module-wide.** Two nested functions with the
  SAME name in different outer frames report `emitProgram: captured variable not
  found in enclosing frame`; renaming one fixes it. Give nested functions distinct
  names in fixtures or this masks whatever the fixture is actually pinning.

## Final report
Files promoted / files advanced-but-not-promoted with the blocking stage /
files untouched with reason / divergences from the host WITH justification /
branch name + final commit SHA.

## Comment policy — state, never diff
Comments describe what the code IS and which invariants it holds — never
what changed, when, or what it used to be (git blame + CHANGELOG own that).
Concretely banned in comments: "was X" / "formerly X" / "renamed from" /
"now does" / "added/new in" / slice or phase tags ("Slice 3", "Phase G") /
PR numbers (#306) — EXCEPT where the rationale genuinely lives in that PR's
discussion and nowhere else (rare; prefer DECISIONS.md). When a change makes
an existing comment narrate history, rewrite it to describe the resulting
state or delete it. Keep (and write) the comments that carry invariants,
contracts, and the WHY a non-obvious shape is required — those are the ones
the next reader needs.
