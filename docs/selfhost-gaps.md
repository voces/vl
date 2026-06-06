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

## 2. Lexer ↔ parser token-`kind` spelling divergence (WORKED AROUND)

**Repro.** Feed real lexer output straight into the parser without remapping; e.g.
the lexer emits `kind == "ID"` for identifiers and `"GREATER_THAN_OR_EQUAL_TO"`
for `>=`, but the parser's `peekKind()`/`binPrec()` compare against `"IDENT"` and
`"GE"`. Every identifier becomes an "expected an expression" error; `>=` never
parses as a binary operator.

**What failed.** The two components were ported separately and chose different
`kind` string tags. Full divergence list (lexer → parser):

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

Everything else already agrees verbatim (all keywords, `NUMBER`/`STRING`/`CHAR`,
the brackets/punctuation, `PLUS`/`MINUS`/`STAR`, `AND`/`OR`, `NEWLINE`/`EOF`, …).

**Workaround.** A `mapKind(k: string): string` in the driver translates the ten
divergent kinds; unmapped kinds pass through. The adapter (`loadToks`) also bridges
the token *shape*: the lexer's `LexTok` is `{kind, text, value, start, stop, line,
col}` while the parser reads `Tok = {kind, text, pos}` from `ast.vl` — but the
parser only ever reads `kind` + `text` and uses `pos` as the cursor index, so the
adapter copies `text` verbatim and sets `pos` to the stream position. The lexer
already EOF-terminates the stream, which is exactly the terminator the parser's
cursor primitives (`peekTok`) expect.

**Suggested fix location.** Align the two `.vl` files on ONE token-kind vocabulary
and ONE token struct. Lowest-churn: rename the lexer's ten divergent kinds to the
parser's terse spellings in `compiler/lexer.vl` (and update the lexer self-host
fixture's expected output in `tests/selfhost_lexer_test.ts`). Bigger but cleaner:
have `parser.vl` consume the lexer's `Tok` shape directly once a module system
lets them share one definition. Deferred to avoid touching files another agent /
the existing lexer fixture depends on.

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
produce the expected diagnostics, with the gaps above handled entirely in
driver/harness glue. No TS-compiler change was required to land the pipeline.
