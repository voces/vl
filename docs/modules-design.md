# VL module system (import/export) + standard-library layout

> Status: **design / research only — every choice here is PROPOSED and
> UNCOMMITTED.** No compiler code exists for this yet, and this document changes
> none. It is a decision record to react to (in the spirit of
> `docs/collections-design.md` and its "names uncommitted" stance), not a fait
> accompli. Names, syntax, and directory layout are all placeholders the owner is
> invited to overrule. A separate change will reference this once the shape is
> agreed.

## Why this exists (the bootstrapping frame)

VL has **no module system today.** A program is *one source string → one wasm
module*: `compile(source)` (`compiler/compile.ts`) tokenizes one string, parses
it against a single `defaultScope()` (`compiler/defaultScope.ts`), and emits one
wasm binary. The CLI (`compiler/cli.ts`) reads exactly one file (`-e`, a path, or
stdin). There is no user `import`/`export`, no multi-file program, and no `.vl`
standard library. `defaultScope` — `print`, the memory/array intrinsics, the
builtin types `i32`/`i64`/`f32`/`f64`/`string`/`boolean` — is the *entire* notion
of "scope you didn't write."

That blocks two roadmap-critical things:

1. **The H3 self-hosting port wants to span multiple files.** `ROADMAP.md` Track H
   has H3 rewrite `toAST`/`typecheck`/`toWasm` as `.vl`. Without modules the only
   option is one enormous `.vl` file — the current TS compiler is already ~10
   files; collapsing it into a single translation unit to port it is a tax we
   should not pay.

2. **The "std written in `.vl` over a thin intrinsic floor" end-state.**
   `docs/collections-design.md` (§LS.1–LS.7) recommends writing `List`/`Map`/`Set`
   as ordinary `.vl` library types over a two-primitive intrinsic floor
   (`__array_new__`/`__array_new_default__` + `__array_copy__`), explicitly the
   Rust/C++/Swift "stdlib-over-primitives" model rather than the Go "baked into the
   language" model. That presupposes *somewhere for `.vl` std to live and a way to
   load it* — which §LS.7 names as the **largest unresolved dependency** behind the
   whole recommendation ("where does `.vl` std live, and how is it loaded?").

So modules are not a feature-for-its-own-sake; they are the missing substrate
under both the self-hosting port and the std-over-primitives plan. The end-state
that shapes everything (H-M2): the whole compiler is **one wasm module** run by a
generic wasm runtime (wasmtime) + a thin host shim — no V8, no binaryen, no Deno.
A module system for VL must terminate in *a single wasm module*, not a bag of
linked ones.

---

## TL;DR — the proposed shape

- **Syntax.** Newline-delimited, no semicolons, fitting VL's existing `function` /
  `let` / `type` decls. **Explicit `export`** on declarations; **named imports**
  with relative paths for user code (`import { f, T } from "./util.vl"`) and
  **bare specifiers** for std (`import { List } from "std/list"`). No
  export-all, no default export, no namespace import in v1.
- **Resolution.** Relative paths resolve from the importing file's directory. Std
  bare specifiers resolve to an **embedded std** bundled into the compiler. A
  thin slice of std (the collections, once migrated) is an **implicit prelude**
  always in scope; the rest is explicitly imported. `defaultScope` stays the
  intrinsic floor (builtins + `__…__` intrinsics), conceptually the root every
  module's scope chains to.
- **Compilation model — whole-program → one wasm module.** `compile()` grows from
  "one string" to "an entry module + a resolver"; the compiler walks the import
  graph, loads every reachable module, type-checks them into one program, and
  emits **one wasm module**. This is the natural fit for VL's existing
  monomorphization and single-wasm-output, and the direct fit for H-M2. Separate
  compilation / wasm-linking is rejected for v1 (rationale below).
- **Std layout.** `std/` of `.vl` source in the repo, **embedded into the compiler
  binary** at build time, exposed via bare specifiers and a small implicit
  prelude. `List`/`Map`/`Set` live here once they migrate off compiler-internal
  helpers, over the collections-design two-primitive intrinsic floor.
- **Phasing.** (1) relative-path imports + explicit `export` + whole-program
  compile → unblocks H3. (2) embedded std + prelude → unblocks std-over-primitives.
  (3) tooling (cross-file LSP).

---

## 1. Survey: modules + std in other languages

Picked for relevance to VL's constraints — **compiles to a single wasm module**, a
**self-hosting** goal, a **scripting feel**, and **aggressive hidden-type
inference**.

| Language | Unit & import surface | Export rule | Resolution | Std delivery | Compile model |
|---|---|---|---|---|---|
| **Rust** | crate (tree of `mod`); `use path::to::item` | explicit `pub` | crate-relative paths + `Cargo`-resolved crate names; no URLs | `std` auto-linked; a **prelude** auto-imports common items; rest via `use std::…` | per-crate compile unit; **monomorphizes generics within a crate**; cross-crate generics re-instantiated in the user crate |
| **Go** | package (a directory); `import "path"` | explicit — **capitalized identifier = exported** | import path rooted at module + GOPATH/module cache | std packages imported by path like any other; nothing implicit except builtins (`make`/`append`/`len`) | whole-package; links packages into one binary |
| **Deno / ES modules** | file; `import { x } from "./y.ts"` / `from "https://…"` | explicit `export` (+ a `default`) | **path/URL specifiers, no central registry**; bare specifiers via an import map | no built-in std; std is just modules you URL-import | bundler/host builds a graph; can bundle to one file |
| **Zig** | file is a struct; `const std = @import("std")` | everything `pub` is reachable through the file's namespace value | `@import` of a path or a named package (`"std"`); package set passed by build | `std` is just a module you `@import`; nothing implicit | whole-program, lazy: only referenced decls are analyzed/compiled |
| **Python** | module (file) / package (dir); `import m` / `from m import x` | implicit — **all top-level names**; `__all__` curates `*` | `sys.path` search list; relative imports within a package | huge batteries-included std on the path; a handful of true builtins always present | interpreted; imports execute module bodies at runtime |

### Trade-offs that matter for VL

- **Explicit vs implicit export.** Go's "capitalization = export" is terse but
  couples a *naming convention* to *visibility* — a poor fit for VL, which already
  separates these concerns and whose `function`/`let`/`type` keywords give a
  natural place to hang an `export` modifier. Python's export-everything makes the
  public surface implicit and hard to evolve. Rust/ES `pub`/`export` make the
  public surface **explicit and greppable** — the right default for a language that
  will host its own compiler (you want the compiler's module boundaries to be
  deliberate). **Lean explicit.**

- **Path vs registry resolution.** Deno's "paths and URLs, no central registry" is
  the lightest possible scheme and matches a young language with no package
  ecosystem yet. Rust/Go bake in a package manager and a resolver — premature for
  VL. **Relative paths for user code now; defer any registry.** Bare specifiers
  (`std/…`) are the one non-path form, reserved for the embedded std.

- **Std: privileged vs just-modules.** Go bakes the growable collection into the
  *language* (`make`/`append`); Python/JS ship one privileged runtime. Rust, C++,
  Swift, and Zig write std as **ordinary library code over a small primitive
  floor** — which is exactly the collections-design recommendation (§LS.1) and the
  one that **ports for free under self-hosting**. **Std is `.vl` modules**, not
  compiler-privileged types. The only privileged layer is the intrinsic floor
  (`__array_new__` etc.), already the same class as `__store_i32__`.

- **Prelude vs explicit-everything.** Rust's auto-prelude (`Vec`, `Option`,
  `String`… in scope unqualified) gives scripting ergonomics without making *all*
  of std implicit; Go/Zig make you import even common things. For a language whose
  pitch is "scripting feel," reaching for a list/map without an import line matters.
  **A small implicit prelude (the collections), explicit import for the rest** —
  the Rust split, sized for a scripting feel.

- **Compile model: whole-program vs separate.** Rust/Go produce per-unit artifacts
  then link; ES/Deno can bundle a graph into one file; Zig is whole-program and
  lazy. The decisive constraint is **monomorphization + one wasm output**. Generics
  monomorphized per call shape cannot be fully compiled in isolation (a generic's
  machine code depends on its instantiations, which live in *other* modules — this
  is exactly why Rust re-instantiates cross-crate generics in the *using* crate).
  Combined with the H-M2 "one wasm module" end-state, **whole-program compile of
  the resolved graph** is the natural fit; Zig's whole-program-lazy model is the
  closest precedent.

---

## 2. Proposed shape for VL

> Reminder: **all PROPOSED / UNCOMMITTED.** Keywords, the `std/` spelling, and the
> directory layout are placeholders.

### 2.1 Import / export syntax

VL is newline-delimited, no semicolons, with `function` / `let` / `type`
declarations and aggressive inference. Modules should add **no new punctuation
discipline** and lean on those existing decls.

**Export — an `export` modifier on a declaration:**

```
export function distance(a: Point, b: Point): f64 { … }
export let TAU = 6.2831853
export type Point = { x: f64, y: f64 }
```

- **Explicit, per-declaration** (Rust `pub` / ES `export`). A module's public
  surface is exactly its `export`-prefixed top-level decls; everything else is
  module-private. No export-all (rejected: makes the public surface implicit and
  un-evolvable — Python's problem) and no separate `export { … }` statement list
  in v1 (rejected: a second place to keep in sync; the inline modifier is enough).
- Re-exports (`export … from`) are **deferred** (not needed to unblock H3).

**Import — named imports, one line, from a specifier:**

```
import { distance, Point } from "./geometry.vl"     // relative, user code
import { List, Map } from "std/collections"         // bare specifier, std
```

- **Named imports only** in v1 — the imported names bind into the importing
  module's top-level scope exactly as if locally declared (so they flow through
  inference, monomorphization, and the symbol table unchanged).
- **No namespace import** (`import * as geo`) and **no default export** in v1.
  Rejected for now: namespace import needs a first-class "module value" (Zig's
  model) — a larger surface than H3 needs; default exports add a second export
  concept (the ES mistake of `default` vs named) for no clear VL win. Both can be
  added later without breaking named imports.
- **Aggressive inference still applies** to imported items: an imported generic
  `function map<T>(…)` monomorphizes at the *call site in the importing module*,
  same as a local generic — imports are a *resolution* mechanism, not a typing
  boundary (see §2.5 monomorphization).
- An imported name participates in **no-redeclaration (B16)** like any other: you
  cannot `import { x }` and also declare a top-level `x` in the same module (one
  binding per name per scope). Shadowing in a nested block stays legal (B16). An
  import *rename* form (`import { x as y }`) is the escape hatch for collisions and
  is a natural early addition (sketched, uncommitted).

### 2.2 Resolution & loading

- **Relative specifiers (`./`, `../`)** resolve against the **importing file's
  directory** (ES/Deno semantics). This is the whole user-code story for v1. The
  `.vl` extension is written explicitly (`"./geometry.vl"`) — matching Deno's
  no-magic-extension stance and keeping the resolver trivial; an
  extension-optional sugar can come later.
- **Bare specifiers (`std/…` or `std:…`)** are reserved for the **embedded std**
  (§2.4) and resolve into the compiler's bundled std, *not* the filesystem. This is
  the one non-path form. There is **no central registry / URL import** in v1
  (rejected as premature — VL has no ecosystem yet; Deno shows URL imports can be
  added later without disturbing path imports).
- **Project root.** v1 needs none — relative paths + the std bare-specifier root
  are sufficient. A future `vl.json`/manifest defining a root or import map
  (Deno-style) is the natural place to add registry/alias resolution; **deferred.**
- **How `defaultScope` relates.** `defaultScope` stays the **intrinsic floor**: the
  builtin types and the `__…__` intrinsics (memory ops, and the collections-design
  `__array_new__`/`__array_copy__` floor when added). Conceptually it is the **root
  scope every module's top-level scope chains to** — always in scope, never
  imported, not part of std. Std proper (`.vl` modules) sits *above* the floor:
  partly implicit (the prelude, §2.4), partly explicit-import.
- **Implicit prelude vs explicit import.** The collections (`List`/`Map`/`Set`) and
  a thin set of universally-useful helpers are an **implicit prelude** — injected
  into every module's scope so `[1, 2, 3]` and a map "just work" without an import
  line (the scripting feel). Everything else in std is **explicitly imported**
  (`import { … } from "std/…"`). This is the Rust prelude split. (Open question:
  exactly what is in the prelude — §OQ.)

**Interaction with the current `compile()` entry.** Today `compile(source: string)`
is single-input. The proposal makes it **graph-aware** without changing the *shape*
callers want:

- `compile()` gains a way to resolve a specifier to source — a **module loader**
  (an injectable `(specifier, fromPath) => source` function, defaulting to "read
  the file" in the CLI, "read the embedded map" for `std/…`, and an in-memory map
  in tests/playground). This keeps `compile.ts` runtime-agnostic (it already avoids
  `Deno`/`process`; the loader is where the host I/O lives, like the CLI's
  `readSource`).
- The CLI passes the entry file's path + a filesystem loader; the playground/tests
  pass an in-memory loader. The existing single-string `-e`/stdin path becomes "a
  one-module graph with a synthetic entry path" — back-compatible.
- `checkOnly`/`parseSymbols` similarly become graph-aware (the LSP needs cross-file
  symbols — §2.6).

### 2.3 Compilation model: whole-program → ONE wasm module

**The H-M2 target is ONE wasm module.** So the question is how N `.vl` files become
one module. **Proposed: whole-program compilation of the resolved module graph.**

1. **Resolve the graph.** Starting from the entry module, follow every `import`,
   load each module's source via the loader, dedupe by resolved specifier, detect
   cycles (allowed for *types/functions*, an error for *value-initialization*
   cycles — same rule the type checker already needs for mutually-recursive types;
   `let` init order across modules is the only genuinely new ordering constraint).
2. **Type-check the whole program together.** Each module gets its own top-level
   scope chained to `defaultScope` + the prelude; imports bind cross-module
   bindings into the importing scope. Names stay module-scoped (no global
   flattening) so B16 no-redeclaration is *per module*, and two modules may each
   define `helper` privately without colliding.
3. **Emit one wasm module.** Monomorphize across the whole program (a generic in
   module A instantiated from a call in module B produces its concrete copy in the
   single output), then emit one binary — exactly the single-module `toWasm` does
   today, just fed the merged, resolved program instead of one file's AST.

**Why whole-program wins here (vs separate compilation + wasm-linking):**

- **Monomorphization is inherently whole-program-ish.** A generic's code depends on
  its instantiations, which live in importing modules. Separate compilation would
  force either (a) re-instantiating generics in each using module (Rust's
  cross-crate scheme — extra machinery, duplicate codegen) or (b) boxing/erasure at
  module boundaries (the Java tax the collections design explicitly rejects, §VL.3:
  no `anyref`, no `ref.cast` per access, soundness contract = every value pinned to
  a concrete type). Whole-program sidesteps both: one monomorphization pass over the
  merged program.
- **One wasm module is the literal H-M2 goal.** Wasm linking (multiple modules +
  imports/exports between them, or the component model) adds a cross-module ABI, a
  linker, and per-module type-section duplication — real complexity whose payoff
  (incremental compile, separate distribution of `.wasm` units) VL does not need:
  the compiler ships as *one* artifact, and programs are *whole* before they run.
- **It is the smallest delta to today's pipeline.** `toWasm` already takes one
  program and emits one module; the per-element array-type interner and the A10
  monomorphizer already operate over the whole AST. Whole-program compile reuses
  all of it — the new work is the *front end* (resolve + merge), not the back end.
- **Dead-code elimination falls out.** Only reachable exports/decls are pulled into
  the merged program (Zig's lazy-analysis benefit), so importing one function from a
  big std module does not drag the whole module into the output.

**Cost / mitigation.** Whole-program means no incremental compile and recompiling
everything on any change. For VL's scale (a self-hosted compiler is tens of files,
user scripts are small) this is fine; binaryen/`toWasm` is the time sink, not the
front end. If incremental builds ever matter, a front-end cache keyed by file hash
is additive and does not require separate *codegen* units.

**Tie to the H3 port's organization.** With whole-program compile, the self-hosted
compiler is free to be **many `.vl` files mirroring the TS layout** —
`lexer.vl`, `parser.vl`, `typecheck.vl`, `toWasm.vl`, etc. — each `export`ing its
public functions/types and `import`ing its dependencies, all compiled together into
the single compiler-wasm module H-M2 runs. The module system is what lets the port
be a faithful file-for-file translation instead of one monolith; the whole-program
model is what lets those files still become the *one* module H-M2 requires.

### 2.4 `.vl` standard-library layout

- **Where it lives.** A `std/` directory of `.vl` source in the repo (sibling to
  `compiler/` and `samples/`). Source-controlled, testable with the existing `.vl`
  corpus (A12), and — critically for self-hosting — *just VL code the compiler
  already compiles*.
- **What's in it (as collections migrate off compiler-internal helpers):**
  - `List<T>` — the growable sequence (`docs/collections-design.md` §VL.1–VL.7),
    written in `.vl` over the **two-primitive intrinsic floor** (`__array_new__` /
    `__array_new_default__` + `__array_copy__`). Today its capabilities live as
    compiler-internal helpers / the fixed-array MVP; this is where they land as
    library code.
  - `Map<K, V>` and `Set<T>` — same floor (buckets are dynamic-length arrays),
    deterministic insertion-order iteration (the multiplayer/replay requirement,
    §LS.6).
  - String utilities beyond the builtin `string` methods; later, math helpers,
    `print`/`println` dispatcher (the §LS.3 opportunistic migration of `print` out
    of codegen into a std `.vl` dispatcher over the existing `__print_T__` sinks).
- **How it's bundled / loaded — embedded in the compiler binary.** Std `.vl` source
  is **embedded into the compiler at build time** (a generated source map the
  loader consults for `std/…` specifiers), so a user program needs no std files on
  disk and no install step — the compiler *is* its std. This matches the H-M2
  end-state cleanly: the compiler-wasm carries its std with it. (Mechanism is an
  implementation detail — a generated `.ts`/embedded blob for the TS compiler, an
  embedded data section for the self-hosted one.)
- **Implicit vs explicit (connecting to "std over primitives").** The collections
  are the **implicit prelude** (no import needed — scripting feel). The rest of std
  is **explicit `import { … } from "std/…"`**. The intrinsic floor stays in
  `defaultScope` (privileged, but *tiny* — two array primitives + the existing
  memory/print sinks); everything above the floor is ordinary `.vl` std. This is
  precisely the collections-design recommendation: **no compiler-intrinsic `List`;
  expose the two-primitive floor and write `List` in VL** — the module system is the
  delivery vehicle that recommendation was missing (§LS.7 OQ2).

### 2.5 Interaction with existing features

- **Symbol table / scopes (`compiler/symbols.ts`, `parser.ts`).** Resolution already
  piggybacks on the live `scopes` stack as the parser walks it. Modules add a
  **per-module top-level scope** chained to `defaultScope` + prelude. An imported
  name becomes a `Binding` (kind `function`/`type`/`variable`) whose `decl` span
  points into the *defining* module's source — so cross-file go-to-def is "follow
  the import to the export's binding." `Binding`/`SymbolOccurrence` need a notion of
  *which file* a span belongs to (today single-document); see §2.6.
- **Name resolution & no-redeclaration / shadowing (B16).** Top-level names are
  **per-module** — B16's "one binding per name per scope" applies within a module
  (and to import-vs-local collisions in that module), but two modules may reuse a
  name privately. Nested-block shadowing is unchanged. This keeps B16 intact while
  making it scale past one file.
- **Generics / monomorphization across module boundaries.** Imports are a
  resolution mechanism, **not a typing or monomorphization boundary**: an imported
  generic monomorphizes at the using call site over the *merged* program, with the
  per-element array-type interner shared program-wide. No boxing at boundaries (the
  soundness contract holds end-to-end). This is *why* whole-program compile is the
  fit (§2.3).
- **LSP (cross-file).** Currently single-document (`SymbolTable` is per-document;
  DECISIONS D2 explicitly scopes cross-file out). Modules make go-to-def / hover /
  find-refs inherently cross-file. The proposal: the LSP keeps a **workspace of
  parsed modules** (a `SymbolTable` per open/loaded file, plus the import edges), so
  `definitionAt` can jump *into another file's* `SymbolTable`, and `referencesAt`
  can scan importers. This is a real expansion of D2 (per-document → workspace) and
  is **phase 3**, not needed to unblock H3.

### 2.6 What changes in the compiler (front-end sketch, not implementation)

- `compile()` / `checkOnly()` gain a **module loader** parameter and become
  graph-walking (resolve → load → check-together → emit-one). Back-compatible
  single-string path = a one-module graph.
- A small **resolver** (specifier + importing path → resolved key + source) with
  three cases: relative path (filesystem via loader), bare `std/…` (embedded map),
  and the synthetic entry. Cycle/dedupe handling lives here.
- `parseProgram` already takes an `initialScope`; it grows to thread a
  **per-module scope** and record cross-module bindings. `SymbolTable` grows a
  file/module dimension (multi-document).
- `toWasm` is **largely unchanged** — it receives the merged, resolved program and
  emits one module, as today. The new work is overwhelmingly front-end.

---

## 3. Phased plan

1. **Phase 1 — relative imports + explicit export + whole-program compile
   (unblocks H3).**
   - `export` modifier on `function`/`let`/`type`; `import { … } from "./path.vl"`.
   - Loader + resolver for relative paths; graph walk with dedupe + cycle handling;
     per-module scopes chained to `defaultScope`.
   - Whole-program type-check + monomorphize + emit one wasm module.
   - **This alone unblocks the H3 port**: the self-hosted compiler can be many
     `.vl` files compiled into one module. No std, no prelude, no tooling needed
     yet. Smallest viable step.

2. **Phase 2 — embedded std + implicit prelude (unblocks std-over-primitives).**
   - Add the two-primitive intrinsic floor to `defaultScope` (the collections-design
     §LS.6 step 1 — independently testable).
   - `std/` directory; bare `std/…` specifier resolution against an embedded map;
     build-time embedding into the compiler.
   - Write `List`/`Map`/`Set` as `.vl` std modules over the floor; wire the
     collections as the implicit prelude.
   - Opportunistically migrate `print` to a std dispatcher (§LS.3) during this work.

3. **Phase 3 — tooling (cross-file LSP).**
   - Workspace of parsed modules; cross-file go-to-def / hover / find-refs;
     import-aware completion. Expands DECISIONS D2 from single-document to workspace.

Phases 1 and 2 are independent enough that Phase 1 can land and serve the H3 port
while Phase 2 proceeds; Phase 3 is purely additive tooling.

---

## 4. Rejected alternatives (summary)

- **Export-all / Python-style implicit exports** — public surface becomes implicit
  and un-evolvable. Rejected for explicit `export`.
- **Go capitalization-as-export** — couples naming convention to visibility; VL
  separates these. Rejected for an `export` modifier.
- **Default exports / namespace imports in v1** — second export concept / needs a
  module-value type; not needed for H3. Deferred, addable later.
- **URL imports / a package registry now** — premature; no ecosystem. Relative
  paths + bare std specifiers suffice; registry deferrable Deno-style.
- **Compiler-privileged `List` (Go model)** — machinery the H3 port must
  re-implement; contradicts collections-design §LS.1. Rejected for `.vl` std over
  the intrinsic floor.
- **Separate compilation + wasm-linking / component model** — adds a cross-module
  ABI + linker, fights monomorphization (forces re-instantiation or boxing), and
  the H-M2 goal is *one* module anyway. Rejected for whole-program compile.
- **All of std explicit (Go/Zig), no prelude** — loses the scripting feel for the
  common collections. Rejected for a small implicit prelude + explicit rest.

---

## 5. Open questions

1. **Keyword/syntax spellings.** `export` modifier vs `pub`; `import { … } from "…"`
   vs another form; bare-specifier spelling (`std/list` vs `std:list` vs `@std/list`).
   All uncommitted.
2. **Prelude contents.** Exactly which std items are implicit (just
   `List`/`Map`/`Set`? plus a `print`/`println`? plus some string/option helpers?).
   Bigger prelude = more scripting feel, less explicitness.
3. **Std specifier root & directory layout.** One `std/collections` module vs
   `std/list` + `std/map` + `std/set`; how `std/` maps to bare specifiers; the
   embedding mechanism (generated source map now; embedded data section for the
   self-hosted compiler later).
4. **Cross-module `let` initialization order.** Functions/types can be
   mutually-recursive across modules (already needed for recursive types); but
   top-level `let` initializers with cross-module dependencies need a defined order
   (topological by import, error on init cycles?). The one genuinely new ordering
   constraint.
5. **Re-exports and rename imports.** `export … from` and `import { x as y }` —
   when (likely Phase 1.5 once collisions bite), and exact syntax.
6. **Extension in specifiers.** Require `.vl` (trivial resolver) vs
   extension-optional sugar. Proposed: require it in v1.
7. **LSP workspace model.** How aggressively to index (lazy per-open-file vs eager
   workspace scan); how this interacts with the embedded std (are std defs
   navigable?). Phase 3.
8. **Visibility granularity.** Only top-level `export`, or eventual module-internal
   visibility tiers? v1: top-level only.

## Sources

- Rust modules/crates/prelude & cross-crate generic instantiation:
  [The Rust Reference — Modules](https://doc.rust-lang.org/reference/items/modules.html),
  [Rust prelude](https://doc.rust-lang.org/std/prelude/index.html),
  [Monomorphization & cross-crate generics](https://rustc-dev-guide.rust-lang.org/backend/monomorph.html).
- Go packages, capitalized-export rule, and builtins:
  [Go spec — Declarations and scope / Exported identifiers](https://go.dev/ref/spec#Exported_identifiers),
  [Go spec — Import declarations](https://go.dev/ref/spec#Import_declarations).
- Deno / ES modules — path & URL specifiers, no central registry, import maps:
  [Deno — Modules](https://docs.deno.com/runtime/fundamentals/modules/),
  [MDN — JavaScript modules](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Modules).
- Zig `@import`, file-as-struct, std as a module, lazy analysis:
  [Zig docs — `@import`](https://ziglang.org/documentation/master/#import),
  [Zig docs — Import std](https://ziglang.org/documentation/master/#Zig-Test).
- Python import system & std on the path:
  [Python — The import system](https://docs.python.org/3/reference/import.html).
- WebAssembly single-module vs linking (why whole-program → one module here):
  [WebAssembly component model overview](https://component-model.bytecodealliance.org/),
  [Wasmtime](https://docs.wasmtime.dev/).
- Internal: `docs/collections-design.md` (§LS.1–LS.7, the std-over-primitives
  recommendation + the open module question), `ROADMAP.md` Track H, `DECISIONS.md`
  (B16, D2), `compiler/defaultScope.ts`, `compiler/compile.ts`,
  `compiler/symbols.ts`, `compiler/cli.ts`.
