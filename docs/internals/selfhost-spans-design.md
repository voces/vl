# Source-span threading in the self-hosted front end — design + measured rollout

Status: rungs 1 (token positions), 2 (node `pos` start offset), and 3 (diagnostics
`line:col`, incl. `@error-at` end-column) LANDED. The `[start, stop)` span DATA the
formatter needs is now complete: `start` is the node's `pos` field, `stop` is the
new `nodeEndOf(nodeIx)` accessor (the stop offset of the node's last token, derived
from the `nodeToks` anchor — the same mechanism the driver's `diagEndCol` already
uses, here returning an absolute char OFFSET instead of a column). Proven by
`tests/selfhost_spans_test.ts`: lexes + parses real source, then slices each
construct (and each `let` initializer) out by its span and checks it reconstructs
the original text. Rung 4 (`@trap` source map) remains. See "Gate results" at the
bottom for the actual runs.

## Why this matters

`tests/selfhost_corpus_test.ts` and `tests/selfhost_native_align_test.ts` both call
out, in their headers, that two directive families are OUT of scope for the
self-host pipeline specifically because **"the AST carries no source positions"**:

- `@error-at L:C TEXT` — an error expected at a precise line:col (host-checker
  territory until span threading + message parity land).
- `@trap …` mapped to `file:line:column` — a runtime trap whose VL-located message
  is matched (roadmap B-debug; needs a source map from emitted code back to spans).

Threading spans is the unlock. This doc measures exactly what changes, in what
order, and what each rung risks against the four hard gates.

## How the HOST (TypeScript) does it — the reference model

The host does NOT store spans inline on AST nodes. Instead (`compiler/ast.ts`,
`compiler/parser.ts`, `compiler/lexer.ts`):

- A token carries `start: Position` and `stop: Position`, where
  `Position = { line: number; column: number }` (1-based line, 0-based column;
  `stop` is exclusive). `compiler/lexer.ts` builds these as it scans.
- A span is `Context = { start: Position; stop: Position }`.
- The parser keeps a **side table** `NodeSpans = WeakMap<object, Context>` keyed by
  node IDENTITY, and threads it: `parseProgram` returns it; `checkOnly`/`compile`
  surface it as `result.spans`; consumers query it with `spanOf(spans, node)`
  (re-exported from `toAST.ts`). Not every node is present (synthesized/desugared
  nodes may be absent) — `spanOf` returns `Context | undefined`.
- The parser helpers are tiny and composable:
  - `spanOf(t) = { start: t.start, stop: t.stop }` (token → span)
  - `between(a, b) = { start: a.start, stop: b.stop }` (merge two spans)
  - `spanFrom(startTok)` (open-ended, closed when the construct ends)
  - `record(node, ctx)` does `spans.set(node, ctx); return node`
- The type algebra (`ast.ts`) only **stores** a `Context` on diagnostics; it never
  inspects it. Diagnostics carry their span and the diagnostics layer renders
  `line:column`. Consumers: `tests/ast_spans_test.ts`, `tests/source_map_test.ts`,
  and the `@error-at` / `@trap` directive logic in `tests/cases_test.ts` — all of
  which currently exercise the HOST compiler only.

Two structural differences make a verbatim port impossible in the self-host:

1. **No `WeakMap` keyed by object identity.** The self-host AST is a flat arena of
   `Node` structs in `P.nodes: Node[]`, referenced by `i32` index (`ast.vl`). There
   is no object identity to key a side table on, and VL has no `WeakMap`. The
   natural self-host analogue of the host's `NodeSpans` is either (a) a parallel
   `i32[]`/struct array indexed by the SAME arena index, or (b) a `pos`/`start`
   FIELD on the node itself. (b) is recommended — see rung 2.
2. **The self-host has two `Tok` types.** `compiler/lexer.vl` defines a `Tok` with
   FULL positions (`start, stop, line, col` — already present, see lines 54–62 and
   the `mkTok` builder). `compiler/ast.vl` defines a SEPARATE, parser-facing `Tok`
   that, before this change, carried only `{ kind, text, pos }` where `pos` is the
   token's INDEX in the stream (the unit the cursor and parser diagnostics use).
   Because VL has no module system, the build concatenates the modules and the
   lexer's `Tok`/`Diag`/`advance` are RENAMED to `LexTok`/`LexDiag`/`lexAdvance`
   (`refresh-compiler.sh`, `native-fixpoint.sh`) to avoid colliding
   with `ast.vl`'s names. So a **bridge** converts the `LexTok` stream into the
   parser's `Tok` stream — and that bridge is where positions were being dropped.

## The minimal self-host representation

- **Tokens (rung 1):** add `start: i32` (char offset of the first char), `line: i32`
  (1-based), `col: i32` (0-based) to `ast.vl`'s `Tok`, mirroring the lexer's
  `LexTok` fields (the lexer already computes all of these; the existing `pos`
  stays as the stream-index cursor unit). The bridge fills them from `LexTok`.
- **AST nodes (rung 2):** add a single `pos: i32` field — the START token's char
  offset (or `-1` for synthesized/desugared nodes) — to every `Node` variant, set
  by the `mk*` constructor from the current token. A single start offset is enough
  for `@error-at` (which pins one point) and is the smallest ripple. (A parallel
  `i32[]` side array indexed by arena index is the alternative; the field is simpler
  because the constructors already return the index and a field travels with the
  node through every read.) The `stop` end of the span needs NO second field: it is
  recovered on demand by `nodeEndOf(nodeIx)` from the `nodeToks` last-token anchor
  (that token's stop offset = `start + text.length`), so the formatter reads `pos`
  for start and `nodeEndOf` for stop — a full `[start, stop)` span with one field.
- **Offset → line:col:** the lexer already produces line/col per token, so rung 2
  can store the START token's `line`/`col` directly on the node (no offset→line:col
  reconstruction needed). Storing the raw `start` offset is also fine; a tiny
  `offsetToLineCol(src, off)` helper can recover line:col, but storing line/col
  avoids keeping the source string around.

## Exactly what changes, rung by rung (MEASURED)

### Rung 1 — token positions in the bridge (IMPLEMENTED here)

Purely additive plumbing; the parser does not yet read the new fields, and the
emitter never sees tokens, so it cannot perturb emitted bytes.

- `compiler/ast.vl`: `Tok` gains `start, line, col` (1 struct, +3 fields).
- The lexer (`compiler/lexer.vl`) is UNCHANGED — `LexTok` already has them.
- **Every site that constructs a parser `Tok` literal must now supply the 3 new
  fields** (VL object literals use width subtyping in `assignable` — see the risk
  note — so a literal MISSING a destination field FAILS to typecheck). Measured
  blast radius: **15 files** contain `P.toks.push({ … })`. Of those:
  - 4 are the real bridges/harnesses that inline `ast.vl`:
    `compiler/driver.vl` (the native/seed driver — fills from the lexed
    token), `tests/selfhost/pipeline_harness.vl` (fills from the lexed token),
    `tests/selfhost/parser_harness.vl` and `tests/selfhost/typecheck_harness.vl`
    (hand-built streams — fill `start:0, line:1, col:0` placeholders).
  - 9 are deno test files that inline `ast.vl` and bridge a real lexer stream:
    `selfhost_emit_fixpoint_test.ts` (×2), `selfhost_emit_fullfixpoint_test.ts`
    (×2), `selfhost_corpus_test.ts`, `selfhost_corpus_run_test.ts`,
    `selfhost_pipeline_test.ts`, `selfhost_self_typecheck_test.ts`,
    `selfhost_emit_program_test.ts` (its `runCase` driver — note this file ALSO
    contains self-contained mini-programs that define their OWN local `Tok`, which
    are left alone), plus `scripts/perf.ts` — all fill `start/line/col` from the
    lexed token `t`.
  - 2 are hand-built helpers needing placeholders: `selfhost_typecheck_test.ts`'s
    `tok()` and the literal token lists in `selfhost_parser_test.ts`.
  - 1 is a TRUE FALSE POSITIVE: `tests/selfhost/goldens.ts` defines its OWN local
    `type Tok = { kind, pos }` in an inlined mini-program and never touches
    `ast.vl`'s `Tok`. LEFT ALONE.

  GOTCHA found while implementing: `selfhost_emit_program_test.ts` is easy to
  mis-classify as a pure false positive (it has `type Tok = {…}` snippets) but ALSO
  has a real `runCase` bridge into `ast.vl`'s `P.toks` — both must be handled
  correctly (fix the bridge, leave the snippets). All real sites are updated here.
- No `mk*` constructor changes. No `is X` driver import-list change (rung 1 adds no
  new `is` narrowing — see the GOTCHA note below).

### Rung 2 — a `pos` on AST nodes

- `compiler/ast.vl`: add `pos: i32` to all **33** `Node` variants and have all
  **33** `mk*` constructors set it. Two viable shapes:
  - (a) add a param to every `mk*` and pass `peekTok().start` from the ~43 call
    sites in `compiler/parser.vl`; or
  - (b) keep the `mk*` signatures and read a module-global "current start" that the
    parser sets at each construct's entry. (a) is explicit but touches ~43 parser
    call sites; (b) is fewer edits but more error-prone (stale current-pos). Either
    way the AST data shape changes for all 33 variants.
- `is`-discrimination invariant (ast.vl header): variants are told apart by
  field-name SETS, which must stay pairwise non-subset. Adding the SAME `pos` field
  to ALL variants preserves every pairwise difference (each pair still differs by
  its original distinct prefix), so `is` stays sound. VERIFY by the self-typecheck
  gate after the change.
- Touch points: 33 struct types + 33 constructors in `ast.vl`; ~43 `mk*` call sites
  in `parser.vl` if using shape (a). `typecheck.vl` and `wasmEmit.vl` need NO read
  changes (they ignore the field) — but see the WasmGC-shape risk below.

### Rung 3 — wire spans into self-host diagnostics (`@error-at`)

- `compiler/typecheck.vl`: `TDiag = { tmsg, tat }` where `tat` is the **AST node
  arena index** the error was raised at (`tErr(msg, at)`, ~80+ call sites pass a
  node index `ix`). To emit `line:col`, map `tat` → `P.nodes[tat].pos` (rung 2) →
  the token's `line`/`col`. Add `tline`/`tcol` to `TDiag` (or compute at render).
- `compiler/parser.vl`: `Diag = { msg, at }` where `at` is a **token index**
  (`P.pos`). Map `at` → `P.toks[at].line`/`.col` (rung 1, already available).
- The driver (`compiler/driver.vl`) `vcDiags()` would render
  `line:col: message` so the native `vl` and the deno harness can adjudicate
  `@error-at`. The corpus/native-align tests would then promote `@error-at` files.
- No emitter change.

### Rung 4 — trap line:col (`@trap` → `file:line:column`)

- Requires a SOURCE MAP from emitted wasm back to AST spans: the emitter
  (`compiler/wasmEmit.vl`) would, per emitted instruction that can trap, record the
  responsible node's `pos`. This is the only rung that touches the emitter and the
  only one with golden-byte risk (it must NOT change emitted CODE — the map is a
  side channel, e.g. a name/custom section or an out-of-band table the host reads).
  Largest, riskiest rung; defer until rungs 1–3 are banked.

## Per-gate risk assessment

| Gate | Rung 1 | Rung 2 | Rung 3 | Rung 4 |
|------|--------|--------|--------|--------|
| Goldens byte-identical (`selfhost_emit_fixpoint_test.ts`) | NONE — tokens never reach the emitter; positions are dropped before emit | NONE — `pos` is an internal AST field the emitter ignores; emitted TYPES are interned by the program's OWN structs, not the compiler's AST node structs | NONE — diagnostics only | HIGH — must not change emitted code bytes; source map must be a side channel |
| Full/self fixpoint (`selfhost_emit_fullfixpoint_test.ts`, `selfhost_self_typecheck_test.ts`) | LOW — the compiler's own wasm shape changes (the `Tok` struct gains fields) but stage2 and stage3 are emitted by the SAME compiler, so they stay byte-identical to each other; self-typecheck must accept the new literals (it does — see results) | MEDIUM — adds a field to 33 node structs → the compiler's self-emitted wasm changes shape consistently across stages (still self-consistent), but the larger surface raises the chance of a checker corner (e.g. a narrowed `is` arm reading a now-wider struct) | LOW — `TDiag` field additions only | LOW–MEDIUM |
| Native fixpoint (`scripts/native-fixpoint.sh`, stage3==stage4) | LOW — same reasoning as full fixpoint; the driver bridge is single-sourced so seed and self-rebuild agree | MEDIUM — as above | LOW | LOW–MEDIUM |
| Full suite + `deno lint` | LOW — mechanical literal updates across 14 files | MEDIUM — 33 constructors + ~43 call sites | LOW | MEDIUM |

### Key risk facts established by reading the code

- **VL object literals use WIDTH SUBTYPING, checked against the DESTINATION's
  fields** (`compiler/typecheck.vl` `assignable`, the `TyObj`→`TyObj` arm: it
  iterates the destination field names and requires the source to have each). So a
  literal with EXTRA fields is fine, but a literal MISSING a destination field
  FAILS. This is why adding a required field to `Tok` breaks every incomplete
  literal — the ripple is mandatory, not optional. (Rung 1 confirmed this
  empirically: before fixing the literals, `selfhost_parser_test.ts` went RED with
  all 7 cases failing to compile; after supplying the 3 fields, GREEN.)
- **The emitter never sees tokens.** `vcLoadToks` builds `P.toks`, the parser
  consumes them into the arena, and the emitter walks `P.nodes`. Token positions
  cannot reach emitted bytes. This is what makes rung 1 golden-safe by construction.
- **GOTCHA (does NOT apply to rungs 1–2):** when a deno driver inlines compiler
  modules, a NEW `is X` narrowing in a `.vl` source needs `X` added to that driver's
  import list. Rungs 1–2 add FIELDS, not new `is` narrowings, so no import-list edit
  is needed. Rung 3 may add an `is` if it narrows a node to read `.pos`; if so, add
  that variant to the relevant driver import lists (`selfhost_wasm_emit_test.ts`,
  `selfhost_typecheck_test.ts`).
- **GOTCHA:** VL pins narrowed bindings — any rung-2/3 code that narrows then reads
  `.pos` must use a fresh variable rather than reassigning the narrowed binding.

## Recommended incremental rollout

1. **Rung 1 (done here):** token `start/line/col` through the bridge. Additive,
   golden-safe by construction, gate-green.
2. **Rung 2:** `pos` on AST nodes via `mk*`. Land alone, behind no behavior change;
   prove all four gates before wiring any consumer. Sequence AFTER the parent's
   in-flight postfix `++` fix (it edits `parser.vl`/`typecheck.vl` — see overlap
   note) to avoid a three-way merge in the `mk*` call sites.
3. **Rung 3:** render `line:col` in diagnostics; promote `@error-at` corpus files in
   `selfhost_corpus_test.ts` / `selfhost_native_align_test.ts`.
4. **Rung 4:** emitter source map for `@trap` line:col. Treat as a separate project;
   highest golden risk.

## Gate results (rung 1, this worktree)

All run AFTER the rung-1 changes (token `start/line/col` through the bridge; no
diagnostics wiring). Every gate GREEN:

- **Goldens byte-identical** — `deno test -A --no-check
  tests/selfhost_emit_fixpoint_test.ts`: 14 passed / 0 failed. (Baseline before the
  change: also 14/0 — confirming the bytes are unchanged.)
- **Full fixpoint + self typecheck** — `SELFHOST_FULL_FIXPOINT=1 deno test -A
  --no-check tests/selfhost_emit_fullfixpoint_test.ts
  tests/selfhost_self_typecheck_test.ts`: 3 passed / 0 failed (stage2==stage3
  byte-identical; self-typecheck zero diagnostics).
- **Native fixpoint** — built `scripts/vl-host` (`cargo build --release`, ok) + seed
  (`scripts/fetch-seed.sh` → `build/vl-compiler.wasm`,
  153809 bytes), then `./scripts/native-fixpoint.sh`:
  `NATIVE FIXPOINT HOLDS: stage3 == stage4 byte-for-byte (224664 bytes)`.
- **Native corpus alignment** — `SELFHOST_NATIVE_ALIGN=1 deno test -A --no-check
  tests/selfhost_native_align_test.ts`: 207 passed / 0 failed.
- **Other self-host suites** — `selfhost_emit_program_test.ts` 239/0,
  `selfhost_parser_test.ts` 7/0, and a combined run of
  `selfhost_typecheck_test.ts` + `selfhost_pipeline_test.ts` +
  `selfhost_corpus_test.ts` + the golden fixpoint: 282/0.
- **`deno lint`** — clean (83 files).
- **Full suite** — `deno task test`: 1898 passed / 0 failed / 210 ignored.

WHAT BROKE AND WHY (and how it was fixed, not skipped): adding the three required
fields to `Tok` immediately turned `selfhost_parser_test.ts` RED — all 7 cases
failed to COMPILE because their inline `{ kind, text, pos }` token literals were now
MISSING `start/line/col`, and VL's `assignable` (width subtyping over the
DESTINATION's fields) rejects a literal that lacks a destination field. The fix was
the mandatory, mechanical ripple: supply the three fields at all 14 real
construction sites (real values from the lexed token at the lexer bridges;
`start:0, line:1, col:0` placeholders at the two hand-built streams). No gate was
weakened or skipped; goldens were NOT regenerated (they never changed).

## Overlap with the parent session's in-flight work

The parent is concurrently editing `compiler/parser.vl` and `compiler/typecheck.vl`
(a postfix `++` fix) on a different branch. **Rung 1 as implemented here does NOT
touch `parser.vl` or `typecheck.vl`** — only `ast.vl` (the `Tok` type), the driver,
the harnesses, and test files — so it merges cleanly. **Rungs 2 and 3 WILL touch
`parser.vl` (mk\* call sites) and `typecheck.vl` (`TDiag`, `tErr` rendering)** and
should be sequenced AFTER the parent's `++` fix lands to avoid colliding in those
two files.
