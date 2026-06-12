# Native module resolution (H3) — design

The plan for making `vl check/run/build` (the Rust driver + self-hosted
compiler wasm) resolve multi-file `import { a } from "./a"` programs, at
parity with the host's `compiler/modules.ts` + `moduleRewrite.ts` front end.
Target corpus: `tests/cases/modules/*` — 5 `@run` dirs (basic, inferred-exports,
name-isolation, rename, transitive) + 4 `@check`/`@error` dirs (err-cycle,
err-not-exported, err-undefined, err-unresolvable); `solo` already passes.

## The host model (the spec we are porting)

The host has NO module system in its core: `modules.ts` is a *front end* that
1. resolves the import graph from the entry (relative `./`/`../` specifiers
   only, `.vl` appended, pure-string-math path normalization, cycle detection),
2. parses each module once, dependency-first,
3. mangles every module's top-level value/type names to `name$mN` (N = module
   load index, entry = 0), rewrites imported locals to the *exporting* module's
   mangled name (scope-aware — locals shadowing a top-level name are left
   alone: `moduleRewrite.ts`),
4. concatenates statements dependency-first into ONE merged Program that the
   unchanged back end compiles to ONE wasm module. Only the ENTRY module's
   `export function`s become host-callable wasm exports; non-entry exports stay
   intra-program linkage (tree-shakeable).
The host CLI gates the multi-file path on a cheap textual check,
`/^\s*import\s*\{/m` (`cli.ts`), keeping the import-free path byte-identical.

## Native architecture

Same shape, split across the wasm/host boundary so the Rust side stays a pure
I/O shim ("the brains land in the wasm, the adapter stays an I/O shim" —
`main.rs`'s charter). The compiler wasm cannot read files, so the driver runs a
**fetch loop**: the compiler tells the host which module keys it still needs;
the host reads them and pushes them in; repeat until the graph is closed.

### New compiler-wasm exports (scripts/vl-compiler-driver.vl)

    modReset()              clear the module table
    modKeyPush(c: i32)      accumulate the next module's KEY (resolved path)
    modSrcPush(c: i32)      accumulate the next module's SOURCE
    modCommit(found: i32)   register (key, source) — found=0 marks "host could
                            not read this key" so the unresolvable diagnostic
                            fires instead of an infinite re-request
    modPendingCount(): i32  resolved keys imported by committed modules that are
    modPendingLen(i)        neither committed nor marked missing — computed by a
    modPendingAt(i, j)      token-level import scan of each committed source

`compileSrc`/`checkSrc` keep their signatures. With an EMPTY module table they
behave exactly as today (single pushed source, imports parse as no-ops) — that
back-compat branch is what keeps every existing concatenated-source consumer
(the selfhost test harnesses, the fixpoint assemblies) byte-identical. With a
non-empty table they run the module pipeline below; the entry is table[0].

### Rust driver loop (scripts/vl-host/src/main.rs)

For `build`/`check`/`run` on VL source that matches the host CLI's
line-leading-`import {` regex AND a compiler module exposing `modCommit`
(older seeds: fall back to today's behavior):

    modReset()
    commit(entry path as given, entry source, found=1)
    while modPendingCount() > 0:
        for each pending key: try fs read → commit(key, source-or-empty, found)
    compileSrc()/checkSrc() as today

Module keys are produced by the compiler's resolver (below) — `/`-separated
paths relative to whatever the entry path was (CWD-relative or absolute), so
the host just does `read_to_string(key)`. Missing file ⇒ `found=0`.

### Module pipeline in VL (driver file, ~5 steps)

All ported from `modules.ts` semantics; lives in `vl-compiler-driver.vl` (it IS
driver logic, and the driver is already single-sourced into both assemblies —
no new concatenation point):

1. **Scan** (incremental, at each `modCommit`): tokenize the committed source
   (the real `tokenize`), walk top-level tokens; collect each
   `import { a as b, … } from "spec"`'s (specifiers, locals, exported names),
   and each top-level `export`-modified declaration name (function/const/let/
   type; depth tracked by brace counting over tokens). Resolve specifiers with
   ports of `resolveSpecifier`/`normalize`/`dirOf` (pure string math). Unseen
   resolved keys → pending. Non-relative specifiers → the host's "Unsupported
   import specifier" diagnostic.
2. **Order + validate** (at compile, once the host closed the graph): DFS from
   entry over resolved imports with a loading-set ⇒ dependency-first order +
   `Import cycle detected through "spec" (module \`key\`)`; missing-marked keys
   ⇒ `Cannot resolve import "spec" (no module \`key\`)`; imported name not in
   the dep's export set ⇒ `"name" is not exported by "spec"` (message texts
   match `modules.ts` — the corpus `@error`s substring them).
3. **Parse** each module in dependency-first order into the SHARED arena
   (tokens append to `P.toks`, so parse-diag token anchors keep their own
   module's line/col; `parseProgram` per module returns per-module roots).
   Imports still parse as no-ops — the scan in step 1 already captured them.
4. **Rename + rewrite**: per module, top-level decl names (minus imported
   locals) map to `name$mN`; imported locals map to the exporter's mangled
   export name. Then a scope-aware arena walker (port of `moduleRewrite.ts`:
   shadow-set threading through params/blocks/loop vars, block-wide `let`
   hoisting) rewrites Name references, call targets, and declaration names.
   NATIVE DIVERGENCE (mechanism, not semantics): the host resolves imported
   TYPES at parse time via a seeded scope, so its rewriter never sees type
   names; the native checker resolves type names from the merged program, so
   the native walker ALSO rewrites type-annotation references (`let p: Point`
   → `Point$m1`) and type declaration names. Inferred export types need no
   special handling natively — the merged-program checker infers them in situ.
   Non-entry modules' `exported` flags are CLEARED during the merge (entry-only
   wasm exports, exactly the host's `hostExports` rule).
5. **Merge**: one Program root whose statement list concatenates the modules'
   statements dependency-first (deps' top-level initializers run first, as in
   the host). `checkProgram` + `emitProgram` run on it UNCHANGED.

### Fixpoint-assembly impact (the one landmine)

`scripts/native-fixpoint.sh` and `scripts/refresh-compiler.sh` feed `vl build`
a CONCATENATED `vlsrc.vl` that still contains the compiler's own line-leading
`import { … } from "./ast"` lines (no-op-skipped today). Under the new gate the
driver would try to resolve `./ast` against the temp dir and fail. Fix: the
assembly seds BLANK OUT import statements — range-aware, since two compiler
imports span lines: `/^import \{/,/\} from "/ s\/.*\/\/` (blank, not delete,
preserving line numbers). VERIFIED up front: building the current assembly with
all imports range-blanked produces a byte-identical compiler wasm (imports are
parse no-ops contributing zero AST nodes/bytes), so stage3/stage4 and the
TS-seed equivalence hold; the slice still re-proves it with a full cold
fixpoint + SELFHOST_FULL_FIXPOINT.

### Diagnostics: path attribution (accepted v1 gap)

`render_diags` prefixes every diagnostic with ONE path (the entry). A type
error inside an imported module will print under the entry path with the
imported module's (correct) line/col. The corpus `@error` checks are message-
substring only, so parity holds; a per-diagnostic `diagPath` export family is
the natural follow-up if this ever bites.

### Out of scope (matching host phase-1)

`std:`/bare specifiers, import maps, namespace/default/re-exports, exported
globals as wasm exports, cross-file LSP. `vl test`/std unblocks AFTER this
lands (needs WASI argv/file IO on top).

## Slice plan (one PR, ~4 commits)

1. Driver .vl: module table + scanner + resolver + pending exports; back-compat
   branch proven byte-identical (goldens + emit fixpoint untouched).
2. Module pipeline: order/validate/parse-merge + rename/rewrite walker.
3. Rust fetch loop + assembly-script import-blanking; native sweep over
   tests/cases/modules/*.
4. Promote the 5 @run dirs + 4 err cases into the native gates; cold
   native-fixpoint + full align battery.

## Post-parity revisit (H3 is a bridge, not the destination)

The merge-by-renaming design below is deliberate migration engineering — full
host parity with zero impact on single-file consumers — NOT the long-term module
system. Once native/host parity is reached, revisit with these intents:

KEEP (correct regardless of era):

- The fetch loop (compiler asks host for sources) — provider-query shape;
  upgrade the char-by-char ABI to bulk string passing when convenient.
- Resolution semantics: relative-only, append `.vl`, no directory guessing,
  cycles rejected.
- Whole-program → one wasm module (cross-module mono/DCE for free; separate
  WasmGC compilation needs a stable ABI + cross-module rec-group identity —
  adopt only when build times force it).
- Dependency-first init order; entry-only host exports.

REPLACE (the load-bearing reversal):

- Name mangling (`name$mN`) + the scope-aware rewriter → SYMBOL-based
  resolution: per-module scopes, imports as first-class bindings, references
  resolve to symbol IDs, not strings. Kills the rewriter (every new AST node /
  scoping construct is a latent silent-corruption bug in the walker — the
  type-position divergence vs the host was this smell showing).
- The `/^\s*import\s*\{/m` textual gate + commit-time token rescan → imports as
  real AST nodes read off one parse; "module mode" stops being a mode.
- Entry-path-only diagnostics → spans carry module identity natively.
- Privacy-via-renaming → checker-enforced visibility ("`secret` is private to
  ./util" beats "is not exported").
