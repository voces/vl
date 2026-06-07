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

## 3. `checkProgram` must be called in value-consuming position (PRE-EXISTING, re-confirmed)

**Repro.** In any driver, `checkProgram(parseProgram())` as a bare statement, or
`let r = checkProgram(...)`, instead of `print(i32ToStr(checkProgram(...)))`.

**What failed.** A codegen "Expected numeric type" at module scale (documented in
`compiler/typecheck.vl` near `checkProgram`). The pipeline module is even larger
than the typecheck-only module (it also carries the full lexer), and re-confirms
the limit: the only form that compiles is consuming the result directly in a
builtin call. The harness/prelude `report()` already follows this rule.

**Suggested fix location.** `compiler/toWasm.ts` — lowering of a discarded /
indirected call return value (same family as the undropped-`.pop()`-value bug).
NOT fixed here (TS compiler is owned by another agent).

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

## H4.2. No value-level bitwise / shift operators (WORKED AROUND)

**Repro.** LEB128 is defined in terms of `& 0x7f`, `>> 7`, `>>> 7`. VL has no
value-level `&` (the `&` token is intersection *types* only), no `|`, `^`, `~`,
`<<`, `>>`, `>>>` (confirmed: none in `compiler/typecheck.ts`).

**What we did.** Emulate with arithmetic: `byte = v % 128`, `v = v / 128`,
continuation bit via `byte + 128`. For signed LEB, emulate arithmetic-shift-right
(floor division) by subtracting 1 when `v < 0 && v % 128 != 0`, since VL `/`
truncates toward zero.

**Suggested fix location.** `compiler/lexer.ts` + `compiler/parser.ts` +
`compiler/typecheck.ts` + `compiler/toWasm.ts` — add the integer bitwise/shift
operator family (wasm has `i32.and/or/xor/shl/shr_s/shr_u` natively, so codegen is
a direct mapping). High value: any byte/binary-format codegen is painful without
it, and the LEB workaround silently relies on small inputs (H4.3).

## H4.3. No unsigned-right-shift → LEB only correct for small values (WORKED AROUND)

**Repro.** A real ULEB of a value with bit 31 set needs an *unsigned* `>>> 7`.
VL i32 is signed and `/ 128` is a signed (arithmetic, truncating) divide, so
`ulebToArr` would loop/sign-extend wrongly for values >= 2^31.

**What we did.** Rely on the fact that every length/index this spike emits is far
below 2^31, so signed `/ 128` matches `>>> 7`. Left a `// GAP:` note. A full
codegen emitting large `i32.const`/offsets MUST get this right.

**Suggested fix location.** Same as H4.2 (the `>>>` operator), or an i64 widening
path for the encoder. Until then any ULEB/SLEB over large magnitudes is unsound.

## H4.4. Signed `%` can be negative — masking needed (WORKED AROUND)

**Repro.** `v % 128` is negative when `v < 0` (VL `%` follows the sign of the
dividend, like wasm `i32.rem_s`). A LEB "low 7 bits" must be 0..127.

**What we did.** `if byte < 0 { byte = byte + 128 }` after every `% 128`, and the
analogous `((b % 256) + 256) % 256` in `emitByte`.

**Suggested fix location.** Not a bug — documents that there is no unsigned
modulo / `rem_u` exposed; the bitwise `& 0x7f`/`& 0xff` (H4.2) is the clean fix.

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
by a byte-exact pin plus live execution. The blocking gaps for a *full* codegen
port (beyond fixed modules) are H4.2/H4.3 (bitwise + unsigned shift, for sound
large-value LEB) and H4.1/H4.5 (a real byte buffer + host handoff).
