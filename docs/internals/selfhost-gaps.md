# Self-hosting front-end gaps (Track H3)

Gaps surfaced while wiring the VL-in-VL front end end to end (raw source →
`compiler/lexer.vl` → `compiler/parser.vl` → `compiler/ast.vl` arena →
`compiler/typecheck.vl`), via `tests/selfhost_pipeline_test.ts` +
`tests/selfhost/pipeline_harness.vl`.

Most of these are NOT TS-compiler bugs — they are *integration* gaps between the
two independently-ported components (lexer vs. parser) plus a couple of
previously-documented codegen limits that the pipeline re-confirms at module
scale. None were fixed in the TS compiler (`parser.ts`/`toWasm.ts`/`typecheck.ts`)
— another agent is editing those. Each gap below is either worked around in the
driver/harness glue (marked WORKED AROUND) or, where it blocks, documented for a
follow-up.

---

## 1. Lexer ↔ parser NAME collisions when concatenated (WORKED AROUND)

**Repro.** Concatenate `lexer.vl + ast.vl + parser.vl + typecheck.vl` (the order
the pipeline needs) and compile:

```
Syntax error: redeclared Tok
Syntax error: redeclared Diag
Syntax error: redeclared advance
```

**What failed.** VL has no module system, so concatenation puts everything in one
namespace. `lexer.vl` defines `type Tok`, `type Diag`, and `function advance()`;
`ast.vl` defines a *different* `type Tok` (`{kind, text, pos}`) and `type Diag`
(`{msg, at}`), and `parser.vl` defines a *different* `function advance()` (the
token cursor). The redeclarations are hard errors.

**Workaround.** The pipeline runner renames the lexer's three colliding symbols in
its SOURCE TEXT before concatenation (`Tok`→`LexTok`, `Diag`→`LexDiag`,
`advance`→`lexAdvance`), using word-boundary regexes so `tokens`/`toks`/`diags`/
`gDiags` are untouched. No `.vl` compiler file is edited, so the standalone lexer/
parser/typecheck self-host tests keep using the unmodified sources.

**Suggested fix location.** The real fix is **a module system** (H3 dependency,
already tracked in `ROADMAP.md`): once `lexer.vl` and `parser.vl` are separate
modules, `Tok`/`Diag`/`advance` are module-local and never collide. Until then,
either (a) keep the driver-side rename (current), or (b) align the two files on
ONE shared token model (see gap #2) and a non-colliding cursor name.

---

## 2. Lexer ↔ parser token-`kind` spelling divergence (RESOLVED)

**Repro.** Feed real lexer output straight into the parser without remapping; e.g.
the lexer emitted `kind == "ID"` for identifiers and `"GREATER_THAN_OR_EQUAL_TO"`
for `>=`, but the parser's `peekKind()`/`binPrec()` compare against `"IDENT"` and
`"GE"`. Every identifier became an "expected an expression" error; `>=` never
parsed as a binary operator.

**What failed.** The two components were ported separately and chose different
`kind` string tags. Full divergence list (old lexer → parser):

| lexer kind                  | parser kind |
| --------------------------- | ----------- |
| `ID`                        | `IDENT`     |
| `EQUAL_TO`                  | `EQ`        |
| `NOT_EQUAL_TO`              | `NE`        |
| `LESS_THAN`                 | `LT`        |
| `GREATER_THAN`              | `GT`        |
| `LESS_THAN_OR_EQUAL_TO`     | `LE`        |
| `GREATER_THAN_OR_EQUAL_TO`  | `GE`        |
| `DIV`                       | `SLASH`     |
| `MOD`                       | `PERCENT`   |
| `EXCLAMATION`               | `BANG`      |

Everything else already agreed verbatim (all keywords, `NUMBER`/`STRING`/`CHAR`,
the brackets/punctuation, `PLUS`/`MINUS`/`STAR`, `AND`/`OR`, `NEWLINE`/`EOF`, …).

**Resolution.** Renamed the ten divergent kinds in `compiler/lexer.vl` to the
parser's terse spellings (`ID`→`IDENT`, `EQUAL_TO`→`EQ`, `NOT_EQUAL_TO`→`NE`,
`LESS_THAN`→`LT`, `GREATER_THAN`→`GT`, `LESS_THAN_OR_EQUAL_TO`→`LE`,
`GREATER_THAN_OR_EQUAL_TO`→`GE`, `DIV`→`SLASH`, `MOD`→`PERCENT`,
`EXCLAMATION`→`BANG`). The `mapKind` translation table was removed from
`tests/selfhost/pipeline_harness.vl` and `tests/selfhost_pipeline_test.ts`. The
lexer self-host fixture in `tests/selfhost_lexer_test.ts` was updated to expect
the new kind spellings. `compiler/parser.vl` was not touched.

---

## 3. `checkProgram` must be called in value-consuming position — RESOLVED

**Status.** RESOLVED (fixed by #89, the void/statement-position value drop).
Verified by repro: a bare discarded non-void call (`compute()` returning `i32`),
`let r = compute()`, a discarded ref-returning call (`makeStr()` → `string`), and
a discarded-plus-indirected `checkProgram`-shaped call (`check(5)` discarded +
`let _x = check(-1)`) all compile and run cleanly — no "Expected numeric type".
A discarded value is dropped in statement position; no further codegen change was
needed.

**Original repro.** `checkProgram(parseProgram())` as a bare statement, or
`let r = checkProgram(...)`, instead of `print(i32ToStr(checkProgram(...)))`.

---

## Status

The front end self-hosts **fully end to end from source text**: the 5 cases in
`tests/selfhost_pipeline_test.ts` (one well-typed program + four seeded type
errors) all drive the genuine `lexer.vl → parser.vl → typecheck.vl` chain and
produce the expected diagnostics. Gap #2 (token-kind divergence) is now resolved
at the source, so no `mapKind` translation is needed in the pipeline glue. Gap #1
(name collisions) is still worked around in the runner via source-text rename; the
real fix awaits a module system. No TS-compiler change was required to land the
pipeline.

---

# Codegen self-host (H4)

Gaps surfaced by the **VL-in-VL wasm emitter** spike — `compiler/wasmEmit.vl`, a
`.vl` program that builds raw WebAssembly bytes, driven by
`tests/selfhost/wasm_emit_harness.vl` + `tests/selfhost_wasm_emit_test.ts`. The
spike emits two fixed modules (`() -> i32` returning 42, and `(i32) -> i32`
identity) and the TS test **instantiates the VL-emitted bytes with the real
`WebAssembly` engine** and asserts `main() === 42` / `id(x) === x`. The round-trip
is green. Each gap below was worked around in the `.vl` spike (`// GAP:` comments
in `compiler/wasmEmit.vl`). NONE were fixed in the TS compiler.

This is a BOUNDED SPIKE: it hand-builds byte sequences, it does NOT yet consume
the AST arena (`compiler/ast.vl`). A full codegen port will need the type-arena +
single-`is`-narrowing-function workarounds already documented for the
type-checker, plus the items below.

---

## H4.1. No `u8` / byte type — bytes are `i32` 0..255 (WORKED AROUND)

**Repro.** WasmGC has `i32`/`i64`/`f32`/`f64` only; there is no `u8` and no
`(array i8)` surfaced in VL. A wasm module is fundamentally a `Uint8Array`.

**What we did.** Represent the output as `i32[]` of byte values 0..255, masked on
append (`emitByte`). This is correct but wasteful (4 bytes per byte) and can't be
handed to `WebAssembly` from inside VL — see H4.5.

**Suggested fix location.** Track B7/B6 — a packed `(array mut i8)` backing
(already on the strings roadmap) would give a real byte buffer; expose a
`u8`/byte element type or at least an `i8`-backed array the codegen can fill.

## H4.2. No value-level bitwise / shift operators (RESOLVED)

**Repro.** LEB128 is defined in terms of `& 0x7f`, `>> 7`, `>>> 7`. VL had no
value-level `&` (the `&` token is intersection *types* only), no `|`, `^`, `~`,
`<<`, `>>`, `>>>` (confirmed: none in `compiler/typecheck.ts` at spike time).

**What we did (before).** Emulate with arithmetic: `byte = v % 128`, `v = v / 128`,
continuation bit via `byte + 128`. For signed LEB, emulate arithmetic-shift-right
(floor division) by subtracting 1 when `v < 0 && v % 128 != 0`, since VL `/`
truncates toward zero.

**Resolution.** Merged in #99 (`feat(numerics): value-level bitwise & shift
operators`). `compiler/wasmEmit.vl` now uses the real operators throughout:
`& 0x7f` / `| 0x80` for the LEB bit manipulation, `>>> 7` for unsigned-LEB shift,
`>> 7` for signed-LEB shift, and `& 0xff` in `emitByte`. The arithmetic workarounds
and all `// GAP:` comments referencing this item have been removed. The byte stream
is identical (pinned by `tests/selfhost_wasm_emit_test.ts`).

## H4.3. No unsigned-right-shift → LEB only correct for small values (RESOLVED)

**Repro.** A real ULEB of a value with bit 31 set needs an *unsigned* `>>> 7`.
VL i32 is signed and `/ 128` was a signed (arithmetic, truncating) divide, so
`ulebToArr` would loop/sign-extend wrongly for values >= 2^31.

**What we did (before).** Rely on the fact that every length/index this spike emits is far
below 2^31, so signed `/ 128` matched `>>> 7`. Left a `// GAP:` note. A full
codegen emitting large `i32.const`/offsets MUST get this right.

**Resolution.** The `>>>` operator now exists (merged in #99, same as H4.2).
`compiler/wasmEmit.vl` uses `v >>> 7` in `ulebToArr` — the unsigned shift is now
correct for all i32 values, including those with bit 31 set.

## H4.4. Signed `%` can be negative — masking needed (RESOLVED via H4.2)

**Repro.** `v % 128` is negative when `v < 0` (VL `%` follows the sign of the
dividend, like wasm `i32.rem_s`). A LEB "low 7 bits" must be 0..127.

**What we did (before).** `if byte < 0 { byte = byte + 128 }` after every `% 128`,
and the analogous `((b % 256) + 256) % 256` in `emitByte`.

**Resolution.** The bitwise `& 0x7f` / `& 0xff` ops from H4.2 (#99) are the clean
fix. `compiler/wasmEmit.vl` now uses `v & 0x7f` for the low-7-bit extract and
`b & 0xff` in `emitByte` — both naturally unsigned, no sign-fix branches needed.

## H4.5. No in-VL handoff of bytes to `WebAssembly` — serialize via decimal string (WORKED AROUND)

**Repro.** The emitter produces `i32[]` inside wasm-GC land; there is no way for a
VL program to *return* a byte buffer the TS/JS host can read directly as a
`Uint8Array` (no linear-memory escape, no host `writeBytes`, and the only host
sink is `print(string)`).

**What we did.** `bytesToStr()` renders the buffer as a comma-joined decimal
string; the TS test `.split(",")`s it back into a `Uint8Array` and instantiates.
Fine for a spike, but a real `vl build` self-hosted codegen needs a genuine
byte-output channel.

**Suggested fix location.** Track H-M2 / C3 — a host import or linear-memory /
`(array i8)` return path so the wasm-side compiler can emit a `.wasm` file's bytes
without a stringly-typed detour. (Ties to H4.1's packed byte array.)

## H4.6. (Minor) no array-spread / concat-in-place builder ergonomics (WORKED AROUND)

**Repro.** Building a section payload wants `dst.push(...src)` or `dst + src`
spread; variadics aren't in yet and `+` concat allocates.

**What we did.** A small `appendAll(dst, src)` loop helper. Low priority — purely
ergonomic; `+` (list concat, B6) also works but allocates a new array each step.

**Suggested fix location.** Track B6 — `xs.push(...ys)` once variadics land
(already noted as deferred in ROADMAP B6).

---

## Codegen self-host status

The vertical slice is **GREEN**: `compiler/wasmEmit.vl` emits valid wasm bytes for
both fixed modules; `tests/selfhost_wasm_emit_test.ts` (2 cases) instantiates them
with the real `WebAssembly` engine and asserts `main() === 42` and `id(x) === x`.
LEB128 (unsigned + signed) and section-length framing are implemented and proven
by a byte-exact pin plus live execution.

H4.2, H4.3, and H4.4 are now **RESOLVED**: the bitwise/shift operator family
(`& | ^ ~ << >> >>>`) was added in #99, and `compiler/wasmEmit.vl` has been
updated to use the real operators throughout — `& 0x7f` / `| 0x80` / `>>> 7` /
`>> 7` / `& 0xff` — replacing all arithmetic emulation. The byte stream is
unchanged (verified by the exact-pin test). The remaining gaps for a *full* codegen
port (beyond fixed modules) are H4.1/H4.5 (a real byte buffer + host handoff).

---

# emitProgram bootstrap gaps (prioritized path to self-hosting)

The end goal of the codegen self-host is **bootstrapping**: having the VL-in-VL
emitter (`compiler/wasmEmit.vl`'s `emitProgram`) compile the self-host compiler
SOURCES themselves — `compiler/lexer.vl`, `compiler/ast.vl`, `compiler/parser.vl`,
`compiler/typecheck.vl`, and `wasmEmit.vl` — so the TS host (`toWasm.ts` et al.)
can be retired.

`emitProgram` today is an i32-centric slice (frontier: params · arithmetic · the
six signed comparisons · calls/recursion · `if`/`return` · `let`/`const`/assign
locals · `while` · ONE struct type (construct + field READ) · fixed i32 arrays
(literal/index/`.length`/index-set) · string literals + `.length` + index read as
code-point `array i32`). A growable `.push` slice is in flight separately. Note
`emitProgram` is **parser-gated**: it only sees what the self-hosted
`parser.vl`/`ast.vl` can parse, so any gap below is also a parser/AST gap where
marked.

This section inventories what the real sources USE that `emitProgram` does **not**
yet emit, ranked by how blocking each is. Every "missing"/"supported" claim was
checked against the current `wasmEmit.vl` (the line refs are to that file). The
gaps are ordered so that resolving them top-to-bottom unblocks the most downstream
code first.

### G1. Discriminated UNIONS + `is`-narrowing — the keystone (LARGE / HIGH risk)

**What's missing.** `emitProgram` has NO notion of a union value. It supports
**exactly one struct `type` per module** (`sDeclared`/`sName`/`sFields`, `collectS`
fails loudly on a second `TypeDecl`, line ~1686) at WasmGC type index 0, all-i32
fields, and it never emits an `is` test, a union valtype, or a downcast. It reads
unions in its OWN source via `is FuncDecl` / `is Block` / … but cannot *emit* code
that does so.

**Who needs it + example.** This is the spine of the AST/typechecker:
- `compiler/ast.vl`: `type Node = NumLit | StrLit | … | Index` (26 variants,
  ast.vl:112), the `Node[]` arena, and every `mk*` constructor builds a variant
  via an untyped object literal widened to `Node` (e.g. `let n: Node = { numText: text }`).
- `compiler/parser.vl` + `compiler/typecheck.vl`: discriminate constantly —
  `typecheck.vl` alone has **61** `is`-narrowing sites (`if t is TyPrim`, `if n is
  FuncDecl`, …), plus its own `type Ty = TyPrim | TyErr | … | TyNullable` union.

**Size/risk.** The single largest item by far. Requires: multiple struct types in
the type section (today hard-capped at one); a union-value representation +
valtype (WasmGC `(ref $common)` / `anyref` + per-variant downcast); lowering `x is
T` to a runtime type test (`ref.test`/`ref.cast` over the variant heap type, the
mechanism the TS `toWasm.ts` already uses); and widening an object literal to a
union member. HIGH risk because the **rest of the back end cannot be exercised on
the real sources until this exists** — almost every function takes/returns a
`Node`-arena index and immediately `is`-narrows.

**Dependency ordering.** Strict prerequisite for G2–G4 to matter at module scale.
The TS compiler already supports user unions + `is` (gap #69 fixed), so the parser
*parses* these sources — the gap is purely in `emitProgram`'s codegen.

### G2. Multiple struct types + struct field WRITE / mutation (MEDIUM)

**What's missing.** Two sub-gaps:
(a) **More than one struct type.** Hard-capped at one (`collectS`). The sources
declare many: `Tok`, `LexResult`, `Diag` (lexer); `Tok`, `Parser`, and 26 node
variants (ast); `Checker`, `TDiag`, and 6 `Ty` variants (typecheck).
(b) **Struct field assignment.** `emitAssign` (line ~1135) lowers a target that is
a bare `Ident` (`local.set`) or an `Index` (`array.set`) ONLY — a `Member` target
(`recv.field = v`, i.e. `struct.set`) is NOT handled and falls into "assignment
target is not a simple name". Field READ (`struct.get`) IS supported (`emitMem`).

**Who needs it + example.** Mutation through the module-global state structs is
pervasive: `P.pos = P.pos + 1` (parser.vl:96, the token cursor), `T.curRet = ret`
(typecheck.vl:727), `gPos = gPos + 1` is a global not a field but the `P.*`/`T.*`
writes are struct-field stores. (Mostly via the module-global `P`/`T`/`gSrc`
state — see G5.)

**Size/risk.** MEDIUM. (a) is mechanical once G1 lifts the one-struct cap (it's the
same cap). (b) is a focused addition to `emitAssign`: resolve the receiver struct
type, find the field index (machinery already exists in `sFieldIndex`/`emitMem`),
emit `struct.set` (`0xfb 0x05 <typeidx> <fieldidx>`). Fields must also become
mutable (already emitted mutable, line ~1501).

### G3. Non-i32 scalar valtypes: `boolean` (and `f64`) params/locals/returns (MEDIUM)

**What's missing.** `emitProgram` is i32-only for scalars. A `boolean` param fails
loudly in `checkParams` ("only i32, struct, array, or string parameters", line
~1304); a `boolean`/`bool` local fails in `checkLocalI32` ("only i32 locals", line
~542); `BoolLit`/`CharLit` initializers are rejected by `checkExprI32` (line ~565).
A `boolean` RETURN type isn't rejected but silently lowers to i32 via `pushVT`'s
`else` branch (wrong-but-not-failing). `f64` is entirely absent.

**Who needs it + example.** `boolean` is everywhere: `function isDigit(c: i32):
boolean { c >= '0' && c <= '9' }` (lexer.vl:84) and ~40 other predicates across all
three sources return `boolean`; `let going = peekKind() == "LBRACK"` (parser.vl:164)
is a `boolean` local. `f64` is only *named* by the typechecker's primitive table
(`mkPrim("f64")`, typecheck.vl:186) — no source does float arithmetic — so f64
codegen is **not** required for bootstrap, only `boolean` is.

**Size/risk.** MEDIUM-LOW. `boolean` is already i32 0/1 at the wasm level, so this
is mostly *bookkeeping*: accept `bool`/`boolean` annotations as an i32 valtype in
`checkParams`/`checkLocalI32`/`vtKindOfType`, and let `BoolLit` lower to `i32.const
0/1`. The comparison ops already yield i32 0/1. CharLit→i32 code-point is the same
trivial lowering as in `decodeStr`. Low risk; no new valtype actually needed.

### G4. Logical `&&` / `||` (short-circuit) and `!` (SMALL / MEDIUM risk)

**What's missing.** `binOpcode` (line ~635) maps `+ - * == != < > <= >=` only and
returns -1 for everything else, so `&&`/`||` hit "unsupported binary operator".
Unary `emitExpr` (line ~1028) accepts only `-`; `!x` hits "unsupported unary
operator".

**Who needs it + example.** Heavily used in the lexer's char classes:
`(c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || c == '_'` (lexer.vl:89);
~32 `&&`/`||` sites in lexer, 13 in typecheck, 6 in parser. `!` appears in
predicates and `if !emitFailed`-style guards.

**Size/risk.** SMALL surface, MEDIUM risk because of **short-circuit semantics** —
`&&`/`||` are not plain `i32.and`/`i32.or`; they must lower to an `if`/`else`
producing an i32 result (the RHS only evaluates when needed), i.e. a value-typed
`if` (blocktype `i32`, `0x7f`). The current `if` lowering is VOID-only (`0x40`,
relies on inner `return`s, line ~1225), so this also needs the first **value-typed
`if`** in the emitter. `!x` is `i32.eqz` (one opcode).

### G5. Module-level mutable globals beyond the single emit-state pattern (MEDIUM)

**What's missing.** `emitProgram` only emits the program's TOP-LEVEL statements
that are `FuncDecl` or `TypeDecl`; `collectFns` (line ~324) fails loudly on ANY
other top-level statement. So a top-level `let`/`const` (a module global, whether
i32 or ref-typed) is unsupported — there is no global section emission at all.

**Who needs it + example.** The sources lean on module globals for state:
`let gSrc = ""`, `let gPos = 0`, `let gDiags: Diag[] = []` (lexer.vl:76–80);
`export let P: Parser = { … }` (ast.vl:164); `export let T: Checker = { … }` and
`export let TY_I32: i32 = -1` plus five more interned-primitive globals
(typecheck.vl:128–137). The whole recursive-descent design deliberately holds state
in globals (`P`/`T`) rather than threaded params (ast.vl:143–160).

**Size/risk.** MEDIUM. Needs a wasm **global section** (id 6): emit each top-level
`let` as a `(global (mut T) <init>)`, route bare-`Ident` reads/writes to
`global.get`/`global.set` when the name resolves to a module global (not a local).
Ref-typed global initializers (`[]`, `{ … }`) need a constant/`start`-function init
path. Interacts with G1/G2 (the globals are union/struct/array-typed).

### G6. String concatenation `+`, equality `==`, and `.slice` (MEDIUM-LARGE)

**What's missing.** Strings are read-only in `emitProgram`: literal construction,
`.length`, and index read (as code points), all over the `array i32` representation.
There is NO string `+` (concat), NO string `==` (the `==` opcode is `i32.eq` over
scalars — comparing two array refs would be reference identity, wrong), and NO
`.slice`/`indexOf`/`substring`. `emitStr`'s own comment notes concat/eq/slice are
DEFERRED (line ~1893).

**Who needs it + example.** Diagnostics + token classification + mangling:
- concat: `"expected " + kind + " but found " + peekKind()` (parser.vl:118),
  `out = digitChar(m % 10) + out` (ast.vl:327, the i32→string the harness needs),
  `name = name + "[]"` (parser.vl:168).
- equality: `if text == "function"` (lexer.vl:154) and the entire keyword/operator
  `==`-chain tables; `if kind == "LBRACK"` everywhere in the parser.
- slice: `text: gSrc.slice(start, gPos)` (lexer.vl:249), `gSrc.slice(gPos, gPos+1)`
  (lexer.vl:348) — the lexer cannot extract a lexeme without it.

**Size/risk.** MEDIUM-LARGE. String `==` is a code-point loop (compare lengths, then
element-by-element) — emittable today as a helper but `emitProgram` must recognize
`==` over string operands and emit the loop instead of `i32.eq`. Concat (`+` over
strings) needs allocation + copy into a fresh `array i32` (ties to the growable/B6
work). `.slice` is a bounded copy. These are method/operator-overload-on-string
lowerings the emitter has no framework for yet; the representation (`array i32`)
already exists, so it's codegen, not a new type. Depends on G3-style operand
type-classification to know `+`/`==` is over strings not i32.

### G7. `.push` on arrays / struct-field arrays (MEDIUM — IN FLIGHT)

**What's missing.** Growable `.push`. `emitProgram`'s arrays are FIXED-LENGTH
WasmGC arrays (`array.new_fixed`); the type-section array is `(array (mut i32))` but
there is no length+capacity wrapper and no `.push` lowering (the "coming" slice).

**Who needs it + example.** Arena/diag building is all `.push`: `P.nodes.push(n)`
(ast.vl:170), `gDiags.push({ … })` (lexer.vl:144), `out.push(byte)` (used in
wasmEmit.vl itself, line ~62), `T.tys.push(t)` (typecheck.vl:144). ~27 `.push`
sites across the sources. Many push onto **struct-field** arrays (`P.nodes`,
`T.tys`) and arrays **of structs/unions** (`Node[]`, `Ty[]`).

**Size/risk.** MEDIUM, already being addressed by the separate growable-`.push`
lane. Once it lands for plain i32 arrays, it must extend to arrays of refs
(`Node[]`/`Ty[]`) — which depends on G1 (a union element valtype).

### G8. Maps (`{[string]: i32}`, `Map()`, `.pop`) (MEDIUM — typecheck-only)

**What's missing.** No map type, no `Map()` constructor, no `.pop`. `emitProgram`
knows only struct / fixed-array / string valtypes.

**Who needs it + example.** ONLY the typechecker: `scopes: {[string]: i32}[]`
(typecheck.vl:121, an array of maps for the scope chain), `T.scopes.push(Map())`
(typecheck.vl:191), and scope-array `.pop()` (typecheck.vl:207, already a documented
wasm-validation gap there). The lexer, ast, and parser do NOT use maps (they use
linear `==`-chains, lexer.vl:149).

**Size/risk.** MEDIUM, but **typecheck-only** — it does not block compiling
lexer/ast/parser/wasmEmit. Can be deferred to the very end (or the checker can be
refactored to parallel arrays, as its own comment hints). `.pop` already has a
known statement-position drop gap noted in `popScope`.

### G9. Function return-type INFERENCE coverage (SMALL — verify)

**What's missing / state.** Nearly all source functions ARE annotated (every
`function` in the three checked sources has an explicit `: T` return), so this is
mostly a non-gap — but a few return-type *result valtypes* are non-i32 (`boolean`,
`string`) and route through `pushVT`; once G3/G6 land this is covered. No separate
inference engine is required for these sources. Listed only so a later lane does not
re-discover it as a surprise.

### Suggested slice order (to bootstrapping)

1. **G1 — unions + `is`** (and the multi-struct cap it shares with G2a). Nothing
   downstream runs on the real AST/checker sources without this; do it first and
   biggest.
2. **G2b — struct field WRITE** (`struct.set`) and **G5 — module globals**
   (global section + `global.get/set`). Together these make the `P`/`T`/`g*` state
   machine emittable — the substrate the lexer/parser/checker mutate.
3. **G3 — `boolean` params/locals/returns** + **G4 — `&&`/`||`/`!`** (with the
   value-typed `if` G4 forces). Cheap, and unblocks every predicate in the lexer.
4. **G7 — growable `.push`** (already in flight) extended to ref-element arrays —
   unblocks all arena/diag building.
5. **G6 — string `==` then `+` then `.slice`** — unblocks the lexer's lexeme
   extraction and all diagnostics/keyword tables.
6. **G8 — maps** (or a parallel-array refactor of the checker) — LAST; isolated to
   `typecheck.vl`.

After 1–5 the lexer, ast, parser, and wasmEmit sources are within reach; 6 closes
the typechecker. f64 is NOT on the path (no source needs float codegen). Each step
should pin its new shape through a `tests/selfhost_emit_program_test.ts`-style
SOURCE→arena→bytes→real-engine round-trip, the same harness this slice uses.
