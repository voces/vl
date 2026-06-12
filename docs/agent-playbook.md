# Parallel-agent playbook (selfhost parity slices)

The standing rules for worktree-isolated agents working on `compiler/*.vl`
native↔host parity. Launch prompts should reference this file and add only:
the capability, the file scope, the target corpus bucket, and any
subsystem-avoidance notes.

## Mission invariants
- The TS host (`compiler/*.ts`) is the spec oracle. Port host behavior into
  `compiler/*.vl`; never add host features; never change language semantics.
- **Golden-neutral**: `git status tests/golden/` must be empty at every
  commit. Never run `UPDATE_GOLDENS`. Rep changes that re-pin goldens are
  serialized work for the orchestrator, not agents.
- **Self-hosting constraint**: the `.vl` files compile themselves — only use
  language features the current native compiler supports; mimic file style.
- **One namespace**: all `compiler/*.vl` share a single namespace in the
  concatenated build — grep before adding any top-level name.
- **Reject-parity**: a change that makes the checker accept more must keep
  every `REJECT_CASES` entry (tests/selfhost_native_align_test.ts) rejecting.

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
`sed -n 's|^// @log ||p' <file>`. Promote to BOTH whitelists:
`tests/selfhost_corpus_run_test.ts` WHITELIST and
`tests/selfhost_native_align_test.ts` RUN_CASES. A file that advances to a
later failure stage is progress to report, not promote.

To diagnose invalid emitted wasm:
    vl build <file> --compiler build/vl-compiler.wasm -o /tmp/x.wasm
    deno eval "try{new WebAssembly.Module(await Deno.readFile('/tmp/x.wasm'));console.log('valid')}catch(e){console.log(e.message)}"

## Trimmed gates (CI covers the full battery)
- Per commit: `git status tests/golden/` empty (+ the REJECT_CASES loop if
  the checker got more permissive).
- Before finishing: `deno test -A --no-check tests/selfhost_emit_fixpoint_test.ts`
  must be 14/14. Read real output (`grep -E "passed|failed"`), never `tail -1`.
- If you add an `is <Node>` narrowing on a new node type, OR call any
  `ast.vl` helper (`mk*`, etc.) not already imported there, add it to the
  import list in `tests/selfhost_wasm_emit_test.ts` and RUN that test —
  three slices have now tripped on this.

## Known landmines
- The FNV constant `0 - 2128831035` in wasmEmit.vl is deliberately
  hand-wrapped for i32 hash semantics — not a bug.
- The type-index oracle formulas (`mAssignTypeIndices` + `*OffsetOf`) are a
  shared chokepoint: interning new heap types means appending a new
  usage-gated offset function, never reordering existing ones.
- Map/list/set/closure struct layouts are rep changes — out of agent scope.

## Final report
Files promoted / files advanced-but-not-promoted with the blocking stage /
files untouched with reason / divergences from the host WITH justification /
branch name + final commit SHA.
