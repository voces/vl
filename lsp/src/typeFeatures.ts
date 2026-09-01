// Pure, runtime-agnostic ASSEMBLY helpers behind the type-aware editor features
// (semantic tokens, inlay hints, completion, hover-doc rendering). As of the
// kill-TS teardown these no longer run any TS compiler pass: the analysis is done
// by the self-hosted wasm checker (`wasmChecker.ts`), and the helpers here turn
// its results into the LSP wire shapes — `semanticTokensDataFromWasm`,
// `inlayHintsFromWasm`, `builtinCompletionsFromWasm`, `memberCompletionsFromWasm`,
// `scopeCompletionsFromBindings`, the keyword/snippet completion lists, the
// `docMarkdown`/`linkifyDocRefs` doc renderer, and the semantic-token legend +
// delta encoder. So this module imports nothing executable from the compiler core
// (only two TYPE aliases) — it's shared verbatim by the Node LSP (`server.ts`)
// and the browser playground (`playground/src/lspAdapter.ts`).
//
// These live in their own module — rather than in `server.ts` — because
// `server.ts` imports the Node-only `vscode-languageserver` package and calls
// `createConnection().listen()` at module load, so it can't be imported by a Deno
// unit test or the browser bundle; this module can.
//
// Position convention: the wasm checker reports 1-based line / 0-based column; the
// LSP wire format is 0-based line / 0-based character. To keep these helpers
// independent of the LSP enums and easy to assert on, they emit *plain* 0-based
// positions; the host wraps the results in the real `InlayHint` / `SemanticTokens`
// shapes.

import type { BindingKind, Position } from "../../compiler/coreTypes.ts";

// ---- semantic tokens (D5) ---------------------------------------------------

// The legend. Order is the contract: token/modifier *indices* in the encoded
// stream refer back into these arrays, and the same legend is advertised to the
// client in `onInitialize`. Adding entries is safe (append only); reordering
// would silently mis-color every token.
//
// Most of these are the standard LSP semantic token types; `boolean` is a custom
// addition (the spec has no boolean type, but the task wants `true`/`false`/
// `null` literals coloured distinctly — clients fall back to a default colour for
// types they don't recognise, so a custom name is safe).
export const SEMANTIC_TOKEN_TYPES = [
  "variable", // a local `let`/`const`
  "parameter", // a function parameter
  "function", // a function declaration / callee
  "type", // a `type` alias / type-position name
  "keyword", // control-flow / declaration keywords
  "string", // string literal
  "number", // numeric literal
  "boolean", // `true` / `false` / `null` literal (custom; not in the LSP spec)
  "operator", // operators & punctuation operators
  "comment", // `//` line comment (incl. `///` doc comments)
  "property", // an object field member name (`o.x`)
  "method", // a function-typed member name (`xs.get`, `s.slice`)
] as const;

export const SEMANTIC_TOKEN_MODIFIERS = [
  "declaration", // the defining occurrence (`isDecl`), vs a use
] as const;

export const SEMANTIC_TOKEN_LEGEND = {
  tokenTypes: [...SEMANTIC_TOKEN_TYPES],
  tokenModifiers: [...SEMANTIC_TOKEN_MODIFIERS],
};

/**
 * Token-type indices, derived from {@link SEMANTIC_TOKEN_TYPES} so the names and
 * their encoded indices can never drift apart. `classify*` helpers index in by
 * name (`TT.keyword`) rather than a magic number.
 */
const TT = Object.fromEntries(
  SEMANTIC_TOKEN_TYPES.map((name, i) => [name, i]),
) as Record<(typeof SEMANTIC_TOKEN_TYPES)[number], number>;

const DECLARATION_BIT = 1 << 0; // index 0 in SEMANTIC_TOKEN_MODIFIERS

/**
 * One classified token span, in 0-based LSP coordinates. Spans are single-line
 * (the external-token helpers drop any whose `length <= 0`, since the encoding
 * below assumes one line per token).
 */
export type ClassifiedToken = {
  line: number; // 0-based
  char: number; // 0-based
  length: number;
  tokenType: number; // index into SEMANTIC_TOKEN_TYPES
  tokenModifiers: number; // bitset over SEMANTIC_TOKEN_MODIFIERS
};

/**
 * Delta-encode classified tokens into the flat `data` array LSP semantic tokens
 * use: groups of five `[deltaLine, deltaChar, length, tokenType, tokenModifiers]`.
 *
 * `deltaLine` is relative to the previous token's line; `deltaChar` is relative
 * to the previous token's char *only when on the same line*, otherwise it's the
 * absolute char. Tokens must already be sorted by (line, char).
 *
 * Factored out and unit-tested because relative encoding is famously easy to get
 * subtly wrong (off-by-one on the same-line vs new-line char delta).
 */
export const encodeSemanticTokens = (tokens: ClassifiedToken[]): number[] => {
  const data: number[] = [];
  let prevLine = 0;
  let prevChar = 0;
  for (const t of tokens) {
    const deltaLine = t.line - prevLine;
    const deltaChar = deltaLine === 0 ? t.char - prevChar : t.char;
    data.push(deltaLine, deltaChar, t.length, t.tokenType, t.tokenModifiers);
    prevLine = t.line;
    prevChar = t.char;
  }
  return data;
};

/**
 * One pre-classified identifier from an EXTERNAL classifier (the wasm checker's
 * `tokensAt`). The `bindKind` (0=variable 1=parameter 2=function) indexes the
 * legend's first three entries directly — the same convention as the symbol-table
 * pass — and `isDecl` carries the declaration modifier. Position is 0-based.
 */
export type IdentToken = {
  line: number;
  char: number;
  length: number;
  bindKind: number; // 0=variable 1=parameter 2=function
  isDecl: boolean;
};

/** An identifier classifier's tokens as {@link ClassifiedToken}s, keyed by position. */
const identTokensByPos = (
  idents: IdentToken[],
): Map<string, ClassifiedToken> => {
  const byPos = new Map<string, ClassifiedToken>();
  for (const id of idents) {
    if (id.length <= 0) continue;
    // bindKind indexes the legend's first three entries (variable/parameter/
    // function); guard defensively against an out-of-range kind.
    if (id.bindKind < 0 || id.bindKind >= SEMANTIC_TOKEN_TYPES.length) continue;
    byPos.set(`${id.line}:${id.char}`, {
      line: id.line,
      char: id.char,
      length: id.length,
      tokenType: id.bindKind,
      tokenModifiers: id.isDecl ? DECLARATION_BIT : 0,
    });
  }
  return byPos;
};

/**
 * One member-access property name from an EXTERNAL classifier (the wasm checker's
 * `memberTokensAt`), already classified `method` vs `property` from its resolved
 * type. Position is 0-based — the same shape the host's AST member walk produces,
 * so the two are interchangeable in {@link semanticTokensDataFromIdentifiers}.
 */
export type ExtMemberToken = {
  line: number;
  char: number;
  length: number;
  isMethod: boolean;
};

/** External member tokens as {@link ClassifiedToken}s (the legend's method/property). */
const memberTokensFromExternal = (
  members: ExtMemberToken[],
): ClassifiedToken[] => {
  const out: ClassifiedToken[] = [];
  for (const m of members) {
    if (m.length <= 0) continue;
    out.push({
      line: m.line,
      char: m.char,
      length: m.length,
      tokenType: m.isMethod ? TT.method : TT.property,
      tokenModifiers: 0,
    });
  }
  return out;
};

/**
 * One classified lexical token from an external source (the wasm checker) — the
 * native counterpart of {@link classifyLexicalTokens} + {@link commentTokens}.
 * `tokenClass` is the wasm lexical enum (0=keyword 1=operator 2=number 3=boolean
 * 4=comment), mapped onto the legend by {@link semanticTokensDataFromWasm}.
 */
export type ExtLexicalToken = {
  line: number; // 0-based
  char: number; // 0-based
  length: number;
  tokenClass: number;
};

// The wasm lexical-token enum → its index in {@link SEMANTIC_TOKEN_TYPES}. Kept
// in lockstep with the driver's `lexClassOf` (scripts/vl-compiler-driver.vl) and
// the WASM_LEX_* constants in wasmChecker.ts.
const LEX_CLASS_TOKEN_TYPE: Record<number, number> = {
  0: TT.keyword,
  1: TT.operator,
  2: TT.number,
  3: TT.boolean,
  4: TT.comment,
};

const lexicalTokensFromExternal = (
  lexical: ExtLexicalToken[],
): ClassifiedToken[] => {
  const out: ClassifiedToken[] = [];
  for (const t of lexical) {
    if (t.length <= 0) continue;
    const tokenType = LEX_CLASS_TOKEN_TYPE[t.tokenClass];
    if (tokenType === undefined) continue; // a future class the host doesn't render
    out.push({
      line: t.line,
      char: t.char,
      length: t.length,
      tokenType,
      tokenModifiers: 0,
    });
  }
  return out;
};

/**
 * Full-document semantic tokens sourced ENTIRELY from the wasm checker (kill-TS):
 * identifiers from `tokensAt`, the lexical layer (keywords/operators/literals/
 * comments) from `lexicalTokensAt`, and members from `memberTokensAt` — no TS
 * `tokenize`/`checkOnly`/AST. Merges with the same precedence as
 * {@link semanticTokensDataFromIdentifiers} (an identifier classification at a
 * position wins over a lexical/member one there).
 */
/**
 * Fuse the lexer's two one-char operator tokens spelling `=>` into ONE
 * keyword-class token, when `source` is supplied to check the lexemes. The
 * arrow reads as a binder, not arithmetic — TS scopes it keyword-ish
 * (`storage.type.function.arrow`) and themes leave plain operators at default
 * foreground, which is why `=>` rendered white. One-line revert: drop the call.
 */
const fuseArrowTokens = (
  tokens: ClassifiedToken[],
  source: string,
): ClassifiedToken[] => {
  const lines = source.split("\n");
  const out: ClassifiedToken[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const a = tokens[i];
    const b = tokens[i + 1];
    if (
      b !== undefined &&
      a.tokenType === TT.operator && b.tokenType === TT.operator &&
      a.length === 1 && b.length === 1 &&
      a.line === b.line && b.char === a.char + 1 &&
      lines[a.line]?.slice(a.char, a.char + 2) === "=>"
    ) {
      out.push({ ...a, length: 2, tokenType: TT.keyword });
      i++;
      continue;
    }
    out.push(a);
  }
  return out;
};

export const semanticTokensDataFromWasm = (
  idents: IdentToken[],
  lexical: ExtLexicalToken[],
  extMembers: ExtMemberToken[],
  source?: string,
): number[] => {
  const identTokens = identTokensByPos(idents);
  const merged: ClassifiedToken[] = [...identTokens.values()];
  const lex = source !== undefined
    ? fuseArrowTokens(lexicalTokensFromExternal(lexical), source)
    : lexicalTokensFromExternal(lexical);
  for (const t of lex) {
    if (!identTokens.has(`${t.line}:${t.char}`)) merged.push(t);
  }
  for (const t of memberTokensFromExternal(extMembers)) {
    if (!identTokens.has(`${t.line}:${t.char}`)) merged.push(t);
  }
  merged.sort((a, b) => a.line - b.line || a.char - b.char);
  return encodeSemanticTokens(merged);
};

// ---- inlay hints (D6) -------------------------------------------------------

/**
 * One inferred-type inlay hint, in 0-based LSP coordinates. `label` is the full
 * text to render (e.g. `": i32"`); the position is just after the declaring
 * identifier so it reads `name: i32`.
 */
export type TypeInlayHint = {
  line: number; // 0-based
  char: number; // 0-based, one past the identifier's last char
  label: string;
  /** The declared name, for tests / tooltips. */
  name: string;
};

/** A 0-based half-open LSP range to filter hints by (the request's `range`). */
export type LspRange = {
  start: { line: number; character: number };
  end: { line: number; character: number };
};

const posInRange = (line: number, char: number, range: LspRange): boolean => {
  const { start, end } = range;
  const afterStart = line > start.line ||
    (line === start.line && char >= start.character);
  const beforeEnd = line < end.line ||
    (line === end.line && char <= end.character);
  return afterStart && beforeEnd;
};

/**
 * The source as a flat array of physical lines, for the by-character scanning the
 * annotation detection below needs. Lazily computed once per `deriveInlayHints`
 * call and threaded through the helpers. A VL `Position` is 1-based line /
 * 0-based column; `lines[pos.line - 1][pos.column]` is the char at that position.
 */
type SourceLines = string[];

const splitLines = (source: string): SourceLines => source.split("\n");

/**
 * Scan forward from a VL position over whitespace (including newlines) and
 * return the first non-whitespace character, plus its position — or `null` at
 * end of input. Used to peek at what immediately follows a span (e.g. is the
 * next token a `:` annotation marker?).
 */
const nextNonSpace = (
  lines: SourceLines,
  start: Position,
): { ch: string; pos: Position } | null => {
  let line = start.line - 1; // 0-based index into `lines`
  let col = start.column;
  while (line < lines.length) {
    const text = lines[line] ?? "";
    while (col < text.length) {
      const ch = text[col];
      if (!/\s/.test(ch)) return { ch, pos: { line: line + 1, column: col } };
      col++;
    }
    line++;
    col = 0;
  }
  return null;
};

/**
 * Whether the declaration whose identifier ends at `idEnd` carries an explicit
 * `: Type` annotation in the source. VL writes the annotation immediately after
 * the binding name — `let x: i32 = …`, `const y: T = …`, a parameter `(a: i32)`
 * — so the binding is annotated iff the first non-whitespace character after the
 * identifier is a colon. (An object literal's `{ x: 1 }` colons belong to the
 * literal, not the binding: the binding name there is followed by `=`/`)`/`,`,
 * never `:`.) This is what lets us honour the headline rule — only hint
 * *inferred* positions, never echo an annotation the user already wrote — without
 * a compiler-core change (the symbol table doesn't record an `annotated` flag).
 */
const isAnnotated = (lines: SourceLines, idEnd: Position): boolean =>
  nextNonSpace(lines, idEnd)?.ch === ":";

/**
 * The position of the matching `)` that closes the parameter list opened by the
 * first `(` at or after `from`, or `null` if unbalanced / absent. Used to place a
 * function's return-type hint (which sits just after the `)`), and to find the
 * gap in which an explicit return annotation (`): T`) would appear. Tracks paren
 * depth so nested parens (a default value, a parenthesised type) don't fool it.
 */
const closingParen = (lines: SourceLines, from: Position): Position | null => {
  let line = from.line - 1;
  let col = from.column;
  let depth = 0;
  let opened = false;
  while (line < lines.length) {
    const text = lines[line] ?? "";
    while (col < text.length) {
      const ch = text[col];
      if (ch === "(") {
        depth++;
        opened = true;
      } else if (ch === ")") {
        depth--;
        if (opened && depth === 0) return { line: line + 1, column: col + 1 };
      }
      col++;
    }
    line++;
    col = 0;
  }
  return null;
};

const toLsp = (pos: Position): { line: number; char: number } => ({
  line: pos.line - 1, // 1-based VL → 0-based LSP
  char: pos.column,
});

// ---- displayable types ------------------------------------------------------
//
// Every rendered type string the editor shows — inlay labels, hover bodies,
// completion details — comes from ONE native producer, `tyToStr`
// (compiler/typecheck.vl), whose own header calls it "type → string (for
// diagnostics)". A diagnostic renderer may legitimately say "there is no type
// here"; an EDITOR SURFACE may not, because both surfaces are annotation-shaped:
// an inlay hint is literally formatted `: T` (a suggestion of the annotation to
// write) and a hover body is fenced as a `vital` code block (a claim that the
// text IS VL). So a rendering the user could not type must never reach them.
//
// `tyToStr` has FOUR give-up markers, and they split into two groups that must be
// treated differently — measured over the 1,311-file `tests/cases` corpus
// (7,733 rendered type strings), counting sightings on files with NO error-tier
// diagnostic:
//
//   ABSENCE of a type — safe to suppress on:
//     `<error>`  TyErr, the unresolved annotation   clean 0 · errored 23
//     `<?>`      an arm `tyToStrGo` doesn't handle  clean 0 · errored  0
//   PRESENCE of a type, elided or unknown — must NOT suppress on:
//     `…`        the depth cap (`tyToStrDepth > 8`) clean 45 · errored 0
//     `_`        no type was determined here
//
// The `…` row is why this list is a measurement and not a guess: it is the ONLY
// bracket-free marker that fires at volume on healthy code (deep recursive types,
// e.g. `generics/recursive-generic-alias-array.vl`). Suppressing on it would
// delete 45 informative hints from correct programs — a worse defect than the one
// this fixes. `<error>` and `<?>` carry no information the user can act on.
//
// `_` IS THE PRODUCER'S ONE BLANK and is deliberately absent from this list. It
// covers an inference hole and an absent arena entry alike (`_[]` for an empty
// literal's element, `{[_]: _}` for an empty `Map()`, `_ | null` for a lone
// `null`) — a rendering that still says what SHAPE the type has, which is what the
// `_`-bearing hints this file's suite pins are for. Nor COULD it join the list:
// this is a SUBSTRING test and `_` occurs inside ordinary identifiers
// (`{foo_bar: i32}`), so listing it would delete hints from healthy code.
//
// NOTE this is a SENTINEL test, not type-string parsing: these are fixed literals
// `tyToStr` emits in place of a type, and no writable VL type rendering contains
// `<` (a generic application renders structurally — `Box<i32>` prints as
// `{v: i32}`). That bracket shape is the whole reason the list can stay a
// substring test, and it is why `_` cannot be added to it. Nothing here inspects
// a type's STRUCTURE.
const ABSENT_TYPE_MARKERS = ["<error>", "<?>"];

/**
 * Whether a native rendered type is fit to show in an annotation-shaped editor
 * surface — i.e. it names a type the user could actually write. False for the
 * empty string and for any rendering carrying one of `tyToStr`'s
 * absence-of-a-type sentinels (see {@link ABSENT_TYPE_MARKERS}). A truncated but
 * real type (`…`) stays displayable.
 */
export const isDisplayableType = (rendered: string): boolean =>
  rendered.length > 0 && !ABSENT_TYPE_MARKERS.some((m) => rendered.includes(m));

/**
 * {@link isDisplayableType} as a pass-through filter for the hover chain: a
 * rendering that isn't displayable becomes `undefined`, so the caller treats it
 * as "no answer" and falls through to the next resolver (member access → type
 * alias → builtin) instead of printing a non-VL type name.
 */
export const displayableType = (
  rendered: string | undefined,
): string | undefined =>
  rendered !== undefined && isDisplayableType(rendered) ? rendered : undefined;

/**
 * One inlay-hint CANDIDATE from an external source (the wasm checker's
 * `inlayHintsAt`): an unannotated declaration with its inferred type. `kind` 0 = a
 * value binding (`let`/`const`/parameter) — the hint sits after the NAME; 1 = a
 * function — the hint is its RETURN type and sits after the param list's `)`.
 * `line`/`col` are the NAME end (1-based line, 0-based col — the native
 * convention).
 */
export type ExtInlayCandidate = {
  kind: number; // 0=value 1=function-return
  line: number; // 1-based name-end line
  col: number; // 0-based name-end col
  type: string;
};

/**
 * Type inlay hints from external candidates (the wasm checker) instead of the TS
 * symbol-table walk — the kill-TS counterpart of {@link deriveInlayHints}. The
 * checker supplies the inferred types + name-end positions; the source-scan
 * filters that stay host-side — skip a declaration the user already annotated,
 * place a function's hint after its `)`, honor the request `range` — are applied
 * here, reusing the same helpers as the TS path.
 */
export const inlayHintsFromWasm = (
  candidates: ExtInlayCandidate[],
  range: LspRange | undefined,
  source: string,
): TypeInlayHint[] => {
  const lines = splitLines(source);
  const hints: TypeInlayHint[] = [];
  for (const c of candidates) {
    // An inlay hint is a suggestion of the annotation to WRITE (`: T`), so a
    // rendering that names no type must not be offered as one.
    if (!isDisplayableType(c.type)) continue;
    const idEnd: Position = { line: c.line, column: c.col };
    // A function's return-type hint sits after the param list's `)`; a value
    // binding's after its name. Skip a function whose `)` can't be located.
    let pos: Position;
    if (c.kind === 1) {
      const close = closingParen(lines, idEnd);
      if (!close) continue;
      pos = close;
    } else {
      pos = idEnd;
    }
    // Skip a declaration the user already annotated (a `:` follows the position).
    if (isAnnotated(lines, pos)) continue;
    const lsp = toLsp(pos);
    if (range && !posInRange(lsp.line, lsp.char, range)) continue;
    hints.push({ line: lsp.line, char: lsp.char, label: `: ${c.type}`, name: "" });
  }
  return hints;
};

// ---- document highlights ----------------------------------------------------
//
// `textDocument/documentHighlight`: every same-file occurrence of the symbol
// under the cursor lights up on cursor rest. The occurrence set is
// `referencesAt` verbatim (the survey's "cheapest genuine polish item"); the
// only shaping is the per-occurrence KIND — the LSP distinguishes a Write
// (the declaration) from a Read (a use). The checker's `referencesAt` returns
// bare ranges without the decl flag, so the host pairs it with `definitionAt`
// (one extra query at the same cursor) and marks the occurrence matching the
// declaring span as the write.

/** LSP-neutral highlight kind; `server.ts` maps to `DocumentHighlightKind`. */
export type HighlightKind = "read" | "write";

/** One document highlight: an occurrence span + read/write classification. */
export type DocumentHighlightSpan = { range: LspRange; kind: HighlightKind };

const sameLspRange = (a: LspRange, b: LspRange): boolean =>
  a.start.line === b.start.line && a.start.character === b.start.character &&
  a.end.line === b.end.line && a.end.character === b.end.character;

/**
 * Shape a reference set into document highlights: the occurrence whose span
 * equals `decl` (the binding's declaring span, from `definitionAt`) is a
 * `write`, every other a `read`. With no known declaration (`decl` undefined —
 * e.g. a seed predating `defAt`) every occurrence is a `read`: the kind is
 * decoration, and "all reads" renders correctly while "wrong write" would not.
 */
export const documentHighlightsFromRefs = (
  refs: LspRange[],
  decl: LspRange | undefined,
): DocumentHighlightSpan[] =>
  refs.map((range) => ({
    range,
    kind: decl !== undefined && sameLspRange(range, decl) ? "write" : "read",
  }));

// ---- document symbols: flat outline (D9.3) ----------------------------------
//
// `textDocument/documentSymbol` as a FLAT list — the survey's shipped grade
// (nesting needs a declaration-body-extent export the seed doesn't have; do
// not fake it with brace counting). Sources, per the survey's sketch:
//   - functions: every decl-flagged identifier of binding kind 2 (`tokensAt`);
//   - module-level `let`/`const`: decl-flagged kind-0 identifiers whose line
//     starts with the declaration itself (a fmt-indented local never does);
//   - `type` aliases: a host-side line scan — type names are deliberately not
//     in the token slice;
//   - the exported flag: `moduleSurface().exports` names (types additionally
//     read their own `export` prefix — the alias may not ride the surface).
// Parameters and function-local bindings are excluded: an outline is a map of
// the module, not a dump of every binding.

/** LSP-neutral outline kind; `server.ts` maps to `SymbolKind`. */
export type OutlineSymbolKind = "function" | "variable" | "constant" | "type";

/** One flat outline entry. Position is the NAME span (0-based, LSP). */
export type OutlineSymbol = {
  name: string;
  kind: OutlineSymbolKind;
  line: number; // 0-based
  char: number; // 0-based
  length: number;
  exported: boolean;
};

// A module-level value declaration: the text before the binding name on its
// line is exactly the declaration prefix. Anchored at the LINE START — a local
// inside a function body is indented (fmt guarantees it), a `for` loop
// variable is preceded by `for `, and both rightly fail this.
const MODULE_DECL_PREFIX = /^(export\s+)?(let|const)\s+$/;

// A `type` alias declaration line: `type Name = …`, optionally exported.
const TYPE_DECL_LINE = /^(export\s+)?type\s+([A-Za-z_][A-Za-z0-9_]*)/;

/**
 * The flat document-symbol outline for `source`: functions + module-level
 * variables from the checker's decl-flagged identifier tokens, `type` aliases
 * from a line scan, sorted by position. `exportedNames` (from `moduleSurface`)
 * marks the exported entries; a degraded surface (empty set) just leaves every
 * flag false rather than dropping symbols.
 */
export const flatDocumentSymbols = (
  idents: IdentToken[],
  source: string,
  exportedNames: ReadonlySet<string>,
): OutlineSymbol[] => {
  const lines = source.split("\n");
  const out: OutlineSymbol[] = [];
  for (const t of idents) {
    if (!t.isDecl || t.length <= 0) continue;
    const lineText = lines[t.line] ?? "";
    const name = lineText.slice(t.char, t.char + t.length);
    if (name.length !== t.length) continue; // span off the line's end; defensive
    let kind: OutlineSymbolKind;
    if (t.bindKind === 2) {
      kind = "function";
    } else if (t.bindKind === 0) {
      const m = MODULE_DECL_PREFIX.exec(lineText.slice(0, t.char));
      if (m === null) continue; // a local / loop binding — not outline material
      kind = m[2] === "const" ? "constant" : "variable";
    } else {
      continue; // parameters
    }
    out.push({
      name,
      kind,
      line: t.line,
      char: t.char,
      length: t.length,
      exported: exportedNames.has(name),
    });
  }
  // `type` aliases: not in the token slice, so scanned from the source. The
  // name starts where the matched prefix ends.
  for (let i = 0; i < lines.length; i++) {
    const m = TYPE_DECL_LINE.exec(lines[i]);
    if (m === null) continue;
    const name = m[2];
    out.push({
      name,
      kind: "type",
      line: i,
      char: m[0].length - name.length,
      length: name.length,
      exported: m[1] !== undefined || exportedNames.has(name),
    });
  }
  out.sort((a, b) => a.line - b.line || a.char - b.char);
  return out;
};

// ---- code lens: export reference counts (D9.4) -------------------------------
//
// One lens per EXPORT declaration — "N refs", cross-module + same-file — read
// from the use-map the unused-export workspace pass already computes on every
// save (`lastUseMap` in server.ts). No new crawl: the lens layer only SHAPES
// data the save pass maintains; the reference LOCATIONS (for the click-through
// peek) are computed lazily in `codeLens/resolve`, so rendering lenses costs
// one `moduleSurface` and a map lookup.

/** One export decl to consider for a lens (native 1-based line, 0-based col). */
export type ExportDeclForLens = {
  name: string;
  declLine: number;
  declCol: number;
};

/** One shaped lens: the export's name span (0-based, LSP) + its total count. */
export type ExportRefLens = {
  name: string;
  line: number; // 0-based
  char: number; // 0-based
  length: number;
  count: number; // cross + local
};

/**
 * Shape the export-reference-count lenses for a file: each export named in
 * `counts` (the file's slice of the workspace use-map) gets one lens carrying
 * `cross + local`. `counts` undefined — no workspace pass has run yet — yields
 * no lenses rather than counts invented from nothing; an export missing from
 * the map (added since the last pass) is likewise skipped, so a lens never
 * shows a stale zero for a symbol the pass has not yet seen. First decl wins
 * on a duplicate name, mirroring `unusedExportHints`.
 */
export const exportRefLenses = (
  exports: ExportDeclForLens[],
  counts: ReadonlyMap<string, ExportRefCountsForLens> | undefined,
): ExportRefLens[] => {
  if (counts === undefined) return [];
  const out: ExportRefLens[] = [];
  const seen = new Set<string>();
  for (const e of exports) {
    if (seen.has(e.name)) continue;
    seen.add(e.name);
    const c = counts.get(e.name);
    if (c === undefined) continue;
    out.push({
      name: e.name,
      line: e.declLine > 0 ? e.declLine - 1 : 0,
      char: e.declCol,
      length: e.name.length,
      count: c.cross + c.local,
    });
  }
  return out;
};

/** The use-map's per-export counts (structurally `ExportRefCounts`). */
export type ExportRefCountsForLens = { cross: number; local: number };

/** The lens title: `0 refs` / `1 ref` / `N refs`. */
export const refCountLensTitle = (count: number): string =>
  `${count} ref${count === 1 ? "" : "s"}`;

// ---- status-bar seed indicator (D9.2) ---------------------------------------
//
// The seed ladder is the extension's number-one operational hazard: a stale or
// missing seed degrades every feature to empty results, which renders exactly
// like a clean file, and the answer ("which rung won?") used to live only in
// the output channel. The server forwards `loadWasmChecker`'s origin callback
// as a `vital/seedOrigin` notification; the extension renders it in one
// status-bar item per window. This helper is the RENDERING — pure, so the
// text/tooltip/degraded-state contract is testable without a VS Code host.

/** The `vital/seedOrigin` payload: the winning rung, or null when NO seed loaded. */
export type SeedOriginInfo = { label: string; detail: string; bytes: number };

/** What the status bar shows. `degraded` → warning background + icon. */
export type SeedStatusView = { text: string; tooltip: string; degraded: boolean };

/** A byte count → a human size for the tooltip (`1.6 MiB` / `312 KiB`). */
const humanBytes = (bytes: number): string =>
  bytes >= 1024 * 1024
    ? `${(bytes / (1024 * 1024)).toFixed(1)} MiB`
    : `${Math.max(1, Math.round(bytes / 1024))} KiB`;

/**
 * Render a seed origin (or its absence) for the status bar. The degraded state
 * is the one this feature exists for: NO seed means diagnostics, hover,
 * completion and navigation are all silently empty, so it gets the `$(warning)`
 * icon and a warning background rather than blending in.
 */
export const seedStatusView = (origin: SeedOriginInfo | null): SeedStatusView =>
  origin === null
    ? {
      text: "$(warning) vl: no seed",
      tooltip: "No VL compiler seed loaded — diagnostics, hover, completion " +
        "and navigation are disabled. Put `vl` on PATH or set " +
        "`vital.compilerWasm`; the Vital output channel lists every location " +
        "tried.",
      degraded: true,
    }
    : {
      text: `vl: ${origin.label}`,
      tooltip: `VL compiler seed — ${origin.label}\n${origin.detail} (${
        humanBytes(origin.bytes)
      })`,
      degraded: false,
    };

// ---- completion (D3) --------------------------------------------------------

/**
 * The semantic category of a completion candidate, in LSP-neutral terms (so this
 * module stays free of the `vscode-languageserver` enums — `server.ts` maps these
 * to `CompletionItemKind`). `"variable"` covers locals; `"parameter"` function
 * params; `"function"` callables; `"type"` `type` aliases and builtin types.
 * `"keyword"` covers reserved words and soft keywords. `"snippet"` covers
 * multi-token skeleton expansions.
 */
export type CompletionKind = BindingKind | "keyword" | "snippet";

/** One completion candidate, runtime-agnostic; `server.ts` wraps it for LSP. */
export type Completion = {
  /** The text inserted / the label shown. */
  name: string;
  kind: CompletionKind;
  /** A short type rendering for the detail column, when a type is known. */
  detail?: string;
  /**
   * The declaration's authored `///` doc-comment (markdown), when it carries
   * one. `server.ts` renders it above the type block in the item's
   * `documentation` panel (see {@link docMarkdown}). Absent for builtins and
   * members (no source binding to read a doc from).
   */
  doc?: string;
  /**
   * For snippet completions: the LSP snippet insert text (tab-stop syntax,
   * `${1:placeholder}`). When present, `server.ts` sets `insertText` to this
   * and `insertTextFormat` to `InsertTextFormat.Snippet`. Absent for plain
   * identifier/keyword items whose `name` is the insert text.
   */
  insertText?: string;
  /**
   * Secondary label text (LSP `labelDetails.description`, rendered right-
   * aligned on the suggestion row). Auto-import items carry the providing
   * module key (`std:test`) here so the user sees where the name comes from.
   */
  description?: string;
  /**
   * Extra workspace edits applied alongside the insertion (LSP
   * `additionalTextEdits`). Auto-import items carry the import-statement
   * rewrite here; `server.ts` also deprioritizes such items (`sortText`) so
   * in-scope names rank first.
   */
  extraEdits?: CompletionEdit[];
};

/** One extra edit a completion applies on accept (`additionalTextEdits`). */
export type CompletionEdit = { range: LspRange; newText: string };

/**
 * The compact inline type annotation shown on a completion's label row, via the
 * LSP 3.17 `CompletionItem.labelDetails.detail` field (e.g. label `foo`,
 * labelDetails `: i32`). It renders less prominently right after the label.
 *
 * This intentionally replaces the old top-level `detail`: VS Code echoes `detail`
 * both on the label row and in the expanded panel header, so pairing it with the
 * highlighted `documentation` markdown made the type appear twice. `labelDetails`
 * shows the inline type WITHOUT populating the panel body, so the type now shows
 * once inline (here) and once highlighted (in `documentation`), never duplicated.
 */
export const typeLabelDetail = (typeStr: string): string => `: ${typeStr}`;

/**
 * Wrap a stringified type in a fenced `vital` code block so the LSP client
 * syntax-highlights it. This becomes a completion item's `documentation` (the
 * expanded detail panel), rendered highlighted via the same TextMate grammar the
 * hover uses — the panel is where the user wanted the type highlighted.
 *
 * Returns the markdown *string* only — kept LSP-enum-free like the rest of this
 * module; `server.ts` wraps it in a `MarkupContent` with `MarkupKind.Markdown`.
 * The fence info string is the language id `server.ts` passes in (`vital`, the
 * id the hover code blocks use), so the markup format stays in one place while
 * the language id lives next to the hover code it must match.
 */
export const typeMarkdown = (typeStr: string, languageId: string): string =>
  "```" + languageId + "\n" + typeStr + "\n```";

// ---- D7: intra-doc cross-references ----------------------------------------
//
// A `[Name]` or `` [`Name`] `` span in a `///` doc-comment is a rustdoc-style
// intra-doc link. When `Name` resolves to a known symbol we rewrite it into a
// clickable markdown link to that symbol's definition location. A `[Name]` that
// does NOT resolve is left UNTOUCHED — it may be a real markdown link-reference
// or literal bracket text.

/**
 * Given a symbol name, returns the markdown link URL (e.g. `file:///…#L5`) for
 * its definition location, or `undefined` when the name is unknown. Injected by
 * `server.ts` so this module stays runtime-agnostic and purely testable with a
 * simple stub.
 */
export type DocRefResolver = (name: string) => string | undefined;

/**
 * Rewrite rustdoc-style intra-doc links in a doc-comment markdown string (D7).
 *
 * Recognised forms:
 *   - `` [`Name`] `` — code-span shorthand reference
 *   - `[Name]`       — plain shorthand reference
 *
 * Where `Name` is an identifier (`[A-Za-z_][A-Za-z0-9_]*`). When `resolve(Name)`
 * returns a URL the span is rewritten into a standard markdown inline link:
 *   - `` [`Name`](url) `` (backtick preserved when the original had one)
 *   - `[Name](url)`
 *
 * Unresolved names and any other bracket syntax (full markdown links `[text](url)`,
 * `[ref][id]`, etc.) are left UNTOUCHED — we only rewrite the shorthand forms
 * where the bracket content is exactly an identifier (possibly backtick-wrapped)
 * and there is NO trailing `(…)` or `[…]` (which would mark an already-formed
 * link).
 *
 * Spans inside code fences (lines starting with ` ``` `) are left verbatim so
 * doc-comment examples don't have their identifiers linkified.
 *
 * @param doc     The doc-comment prose (already stripped of `/// ` prefixes).
 * @param resolve Called with each candidate name; return a URL string to linkify,
 *                or `undefined` to leave the span untouched.
 */
export const linkifyDocRefs = (
  doc: string,
  resolve: DocRefResolver,
): string => {
  // Process line-by-line so fence state is tracked without complex look-behind.
  const lines = doc.split("\n");
  let insideFence = false;
  const out: string[] = [];
  for (const line of lines) {
    // A line starting with ``` toggles fence state (open or close).
    if (/^```/.test(line)) {
      insideFence = !insideFence;
      out.push(line);
      continue;
    }
    if (insideFence) {
      out.push(line);
      continue;
    }
    // Prose line: rewrite [`Name`] and [Name] where Name is an identifier and
    // there is no existing `(url)` or `[ref]` suffix — those mark full links.
    //
    // Regex:
    //   \[(`?)                      opening `[`, capture optional backtick
    //   ([A-Za-z_][A-Za-z0-9_]*)   identifier (the symbol name to resolve)
    //   \1                          matching backtick (or empty if none)
    //   \]                          closing `]`
    //   (?![([\]])                  NOT followed by `(`, `[`, `]` (full link)
    const processed = line.replace(
      /\[(`?)([A-Za-z_][A-Za-z0-9_]*)\1\](?![([\]])/g,
      (match, tick: string, name: string) => {
        const url = resolve(name);
        if (url === undefined) return match; // unknown — leave untouched
        return `[${tick}${name}${tick}](${url})`;
      },
    );
    out.push(processed);
  }
  return out.join("\n");
};

/**
 * The markdown body shown in hover and in completion `documentation`: the
 * declaration's authored `///` doc-comment (rendered as markdown by the client),
 * then a blank line, then the fenced `vital` type block — so prose comes first
 * and the type reads beneath it. When `doc` is absent or blank, this is exactly
 * the bare type block ({@link typeMarkdown}), so undocumented declarations render
 * identically to before. When `typeStr` is empty (a documented binding with no
 * known type) the type fence is omitted and just the doc prose is returned.
 *
 * When `resolve` is provided (D7), any `` [`Name`] `` / `[Name]` spans in `doc`
 * that resolve to a known symbol are rewritten as clickable markdown links before
 * the prose is assembled. Unresolved spans and full markdown links are left alone.
 *
 * Returns the markdown *string* only — LSP-enum-free like the rest of this
 * module; `server.ts` wraps it in a `MarkupContent`. Factored out (and unit
 * tested) so the doc-above-type layout lives in one place shared by hover and
 * completion.
 */
export const docMarkdown = (
  typeStr: string,
  languageId: string,
  doc?: string,
  resolve?: DocRefResolver,
): string => {
  const fence = typeStr === "" ? "" : typeMarkdown(typeStr, languageId);
  const trimmed = doc?.trim();
  if (!trimmed) return fence;
  const linked = resolve ? linkifyDocRefs(trimmed, resolve) : trimmed;
  return fence ? `${linked}\n\n${fence}` : linked;
};

/**
 * One in-scope binding from an EXTERNAL source (the wasm checker's `scopeAt`),
 * the native counterpart of a {@link SymbolTable} binding. `kind` is
 * 0=variable / 1=parameter / 2=function (the same convention as
 * {@link IdentToken}'s `bindKind`); `type` is the rendered type string, empty
 * when none. Local to this module — like {@link IdentToken} / {@link
 * ExtMemberToken} — so the helper stays decoupled from the compiler core.
 */
export type ScopeBinding = {
  name: string;
  kind: number; // 0=variable 1=parameter 2=function
  type: string; // rendered type, "" when none
};

/** Map a 0/1/2 scope kind to its {@link CompletionKind} (variable/parameter/function). */
const scopeBindingKind = (kind: number): CompletionKind =>
  kind === 1 ? "parameter" : kind === 2 ? "function" : "variable";

/**
 * Scope-aware identifier completions from an external binding set (the wasm
 * checker's `scopeAt`) instead of the TS symbol table — the kill-TS counterpart
 * of {@link identifierCompletions}'s user-binding half. Each binding maps to a
 * {@link Completion} tagged with its kind, carrying the rendered `type` as
 * `detail` (dropped to `undefined` when empty). De-duped by name (last wins),
 * mirroring {@link identifierCompletions}'s `byName` map.
 *
 * `server.ts` merges these OVER the builtin-derived completions — the native
 * scope set covers only user var/param/fn bindings, not builtins/imports/types —
 * so a user binding shadows a same-named builtin, matching the TS path.
 */
export const scopeCompletionsFromBindings = (
  bindings: ScopeBinding[],
): Completion[] => {
  const byName = new Map<string, Completion>();
  for (const b of bindings) {
    byName.set(b.name, {
      name: b.name,
      kind: scopeBindingKind(b.kind),
      // The detail renders as `: T` on the label row and as a `vital` code block
      // in the docs panel, so it takes the same displayable-type filter as the
      // inlay label — an undisplayable rendering is dropped, not shown.
      detail: isDisplayableType(b.type) ? b.type : undefined,
    });
  }
  return [...byName.values()];
};

/** An external member-completion entry (the wasm checker's `memberCompletionsAt`). */
export type ExtMemberCompletion = {
  name: string;
  detail: string;
  isMethod: boolean;
};

/** An external builtin completion (the wasm checker's `builtinCompletions`). */
export type ExtBuiltin = {
  name: string;
  kind: number; // 0=type 1=function
  detail: string;
};

/**
 * Builtin completions from an external source (the wasm checker's
 * `builtinCompletions`) instead of the TS `defaultScope` — the kill-TS
 * counterpart of {@link identifierCompletions}'s builtin half. A function-kind
 * builtin maps to the `function` completion kind, a type-kind to `type`; the
 * rendered `detail` is dropped to `undefined` when empty.
 */
export const builtinCompletionsFromWasm = (
  builtins: ExtBuiltin[],
): Completion[] =>
  builtins.map((b) => ({
    name: b.name,
    kind: b.kind === 1 ? "function" : "type",
    detail: isDisplayableType(b.detail) ? b.detail : undefined,
  }));

/**
 * Member completions from an external member set (the wasm checker's
 * `memberCompletionsAt`) instead of the TS `receiverObjectType` +
 * {@link memberCompletions}. A function-typed member maps to the `function`
 * completion kind, any other to `variable`; the rendered `detail` is dropped to
 * `undefined` when empty. De-duped by name (first wins), matching
 * {@link memberCompletions}'s `seen` set.
 */
export const memberCompletionsFromWasm = (
  members: ExtMemberCompletion[],
): Completion[] => {
  const byName = new Map<string, Completion>();
  for (const m of members) {
    if (byName.has(m.name)) continue;
    byName.set(m.name, {
      name: m.name,
      kind: m.isMethod ? "function" : "variable",
      detail: isDisplayableType(m.detail) ? m.detail : undefined,
    });
  }
  return [...byName.values()];
};

// VL keywords: hard keywords (reserved by the lexer) plus soft keywords
// (contextual — lexed as `ID` but given syntactic meaning by the parser). We
// enumerate them statically rather than importing the lexer's `KEYWORDS` map so
// this module stays free of runtime dependencies on the compiler internals.
//
// Hard keywords (from lexer.ts `KEYWORDS` map):
//   function if else while for const let return is await break continue
//   import export type true false null
// Soft keywords (recognized by text in parser.ts via `atSoft`):
//   as from in step to
// (`then` was removed from the language on 2026-08-31 — see DECISIONS.md.)
//
// Exported (beyond the completion list below) for rename's new-name validation
// (`rename.ts`): a hard keyword can never be an identifier, and a soft keyword
// — while lexed as an ID — re-parses as syntax in the very positions a renamed
// binding is likely to appear (`for x in xs`, `import { a as b }`), so rename
// refuses both as a NEW name.
export const VL_HARD_KEYWORDS: readonly string[] = [
  "function",
  "if",
  "else",
  "while",
  "for",
  "const",
  "let",
  "return",
  "is",
  "await",
  "break",
  "continue",
  "import",
  "export",
  "type",
  "true",
  "false",
  "null",
];

export const VL_SOFT_KEYWORDS: readonly string[] = [
  "as",
  "from",
  "in",
  "step",
  "to",
];

/**
 * Keyword completions for VL: all hard keywords (reserved by the lexer) plus
 * the contextual soft keywords (`as`, `from`, `in`, `step`, `to`).
 * Each item carries `kind: "keyword"` so `server.ts` maps it to
 * `CompletionItemKind.Keyword`. These are returned as plain text items (no
 * `insertText`); clients filter the list against the typed prefix, so the full
 * list is always returned and narrowing happens client-side.
 *
 * Returns an empty list when `afterDot` is `true` — keywords are never valid
 * as member names after a `.` receiver.
 */
export const keywordCompletions = (afterDot: boolean): Completion[] => {
  if (afterDot) return [];
  return [...VL_HARD_KEYWORDS, ...VL_SOFT_KEYWORDS].map((kw) => ({
    name: kw,
    kind: "keyword" as const,
  }));
};

/**
 * Common structural snippet completions for VL — skeleton expansions for the
 * most-typed declaration and control-flow forms. Each item uses LSP tab-stop
 * syntax (`${N:placeholder}`) in `insertText`. The label (`name`) is the
 * trigger keyword so the item appears alongside the regular keyword suggestion;
 * `kind: "snippet"` distinguishes it (maps to `CompletionItemKind.Snippet`).
 *
 * Returns an empty list when `afterDot` is `true` — snippets are never valid
 * after a `.` receiver.
 *
 * Snippet set (idiomatic VL syntax — braces on same line, no semicolons):
 *   function …  →  function ${1:name}(${2:params}): ${3:T} {\n\t${0}\n}
 *   if …        →  if ${1:cond} {\n\t${0}\n}
 *   else if …   →  else if ${1:cond} {\n\t${0}\n}
 *   else { }    →  else {\n\t${0}\n}
 *   while …     →  while ${1:cond} {\n\t${0}\n}
 *   for … in …  →  for ${1:item} in ${2:collection} {\n\t${0}\n}
 *   type …      →  type ${1:Name} = ${0}
 *   let …       →  let ${1:name} = ${0}
 *   const …     →  const ${1:name} = ${0}
 *   return …    →  return ${0}
 */
export const snippetCompletions = (afterDot: boolean): Completion[] => {
  if (afterDot) return [];
  return [
    {
      name: "function",
      kind: "snippet" as const,
      insertText: "function ${1:name}(${2:params}): ${3:T} {\n\t${0}\n}",
    },
    {
      name: "if",
      kind: "snippet" as const,
      insertText: "if ${1:cond} {\n\t${0}\n}",
    },
    {
      name: "else if",
      kind: "snippet" as const,
      insertText: "else if ${1:cond} {\n\t${0}\n}",
    },
    {
      name: "else",
      kind: "snippet" as const,
      insertText: "else {\n\t${0}\n}",
    },
    {
      name: "while",
      kind: "snippet" as const,
      insertText: "while ${1:cond} {\n\t${0}\n}",
    },
    {
      name: "for",
      kind: "snippet" as const,
      insertText: "for ${1:item} in ${2:collection} {\n\t${0}\n}",
    },
    {
      name: "type",
      kind: "snippet" as const,
      insertText: "type ${1:Name} = ${0}",
    },
    {
      name: "let",
      kind: "snippet" as const,
      insertText: "let ${1:name} = ${0}",
    },
    {
      name: "const",
      kind: "snippet" as const,
      insertText: "const ${1:name} = ${0}",
    },
    {
      name: "return",
      kind: "snippet" as const,
      insertText: "return ${0}",
    },
  ];
};

// ---- std auto-import completions ---------------------------------------------
//
// Completion items for std-module exports that are NOT in scope: accepting one
// inserts the name AND rewrites the import statement (`extraEdits`), so the
// program stays check-clean. The import rewrite must land where `vl fmt` keeps
// it — fmt SORTS a statement's specifiers alphabetically (and preserves the
// order of the statements themselves) — so the rewritten statement is spelled
// by the real formatter when the caller supplies one (`formatImport`, wired to
// the seed's `formatSrc` so the placement can't drift from fmt), with an
// alphabetical hand-sort as the seedless fallback.

/** Convert a char offset in `source` to a 0-based LSP position. */
export const offsetToPos = (
  source: string,
  offset: number,
): { line: number; character: number } => {
  let line = 0;
  let lineStart = 0;
  for (let i = 0; i < offset; i++) {
    if (source[i] === "\n") {
      line++;
      lineStart = i + 1;
    }
  }
  return { line, character: offset - lineStart };
};

const escapeRegExp = (s: string): string =>
  s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * The edit that makes `name` (exported by the module at `moduleKey`) imported
 * in `source`:
 *   - an existing `import { … } from "<moduleKey>"` (single- or multi-line) is
 *     REPLACED by the same statement with `name` merged into its specifiers,
 *     spelled by `formatImport` (fmt-sorted) or an alphabetical fallback;
 *   - otherwise a new `import { name } from "<moduleKey>"` line lands after the
 *     LAST import statement (fmt preserves statement order), or at the very top
 *     when the file has none. fmt guarantees exactly one blank line between the
 *     import block and the first statement, so when the insertion lands directly
 *     above a non-import, non-blank line the inserted text carries that blank —
 *     the result is fmt-stable as inserted.
 * `undefined` when the statement already binds `name` (plain or as an alias
 * source) — nothing to do.
 */
export const importInsertionEdit = (
  source: string,
  moduleKey: string,
  name: string,
  formatImport?: (stmt: string) => string | undefined,
): CompletionEdit | undefined => {
  const existing = new RegExp(
    `import\\s*\\{([^}]*)\\}\\s*from\\s*"${escapeRegExp(moduleKey)}"`,
  ).exec(source);
  if (existing !== null) {
    const specs = existing[1].split(",").map((s) => s.trim()).filter((s) =>
      s.length > 0
    );
    // Already bound here — exactly, or as the source half of an `as` alias.
    if (specs.some((s) => s === name || s.startsWith(`${name} `))) {
      return undefined;
    }
    const stmt = `import { ${[...specs, name].join(", ")} } from "${moduleKey}"`;
    const newText = (formatImport?.(stmt + "\n") ??
      `import { ${[...specs, name].sort().join(", ")} } from "${moduleKey}"`)
      .trimEnd();
    return {
      range: {
        start: offsetToPos(source, existing.index),
        end: offsetToPos(source, existing.index + existing[0].length),
      },
      newText,
    };
  }
  // No import of this module yet: a fresh statement after the last import (the
  // statement-spanning regex keeps a multi-line import intact — a line scan for
  // `^import` would split one).
  const anyImport = /import\s*(\{[^}]*\}\s*from\s*)?"[^"]*"/g;
  let lastEnd = -1;
  for (let m = anyImport.exec(source); m !== null; m = anyImport.exec(source)) {
    lastEnd = m.index + m[0].length;
  }
  // fmt keeps exactly one blank line between the import block and the first
  // statement: an insertion landing directly above a non-blank line that is not
  // itself part of the import block (an import, or a `export { … } from`
  // re-export) must carry the blank, or the inserted result drifts under fmt.
  const needsBlankAbove = (lineIdx: number): boolean => {
    const line = (source.split("\n")[lineIdx] ?? "").trim();
    return line !== "" && !/^(import\b|export\s*\{)/.test(line);
  };
  const stmt = `import { ${name} } from "${moduleKey}"`;
  if (lastEnd < 0) {
    return {
      range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } },
      newText: stmt + (needsBlankAbove(0) ? "\n\n" : "\n"),
    };
  }
  const after = offsetToPos(source, lastEnd);
  const insertAt = { line: after.line + 1, character: 0 };
  // A last import that the file ends on without a newline: append below it.
  if (source.indexOf("\n", lastEnd) < 0) {
    return { range: { start: after, end: after }, newText: "\n" + stmt };
  }
  return {
    range: { start: insertAt, end: insertAt },
    newText: stmt + (needsBlankAbove(insertAt.line) ? "\n\n" : "\n"),
  };
};

/** One std-module export the auto-import pass may offer. */
export type StdExportCandidate = {
  name: string;
  kind: CompletionKind;
  detail?: string;
};

/**
 * Auto-import completion items over `stdExports` (module key → exports, from
 * the server's cached per-module surface scan): every export whose name is not
 * already in scope (`inScope`) yields ONE item — first module wins on a name
 * two modules export — carrying the providing module key as `description` and
 * the import rewrite as `extraEdits`. Modules are visited in sorted-key order
 * so the winner is deterministic.
 */
export const stdAutoImportCompletions = (
  source: string,
  stdExports: Map<string, StdExportCandidate[]>,
  inScope: (name: string) => boolean,
  formatImport?: (stmt: string) => string | undefined,
): Completion[] => {
  const out: Completion[] = [];
  const offered = new Set<string>();
  for (const key of [...stdExports.keys()].sort()) {
    for (const exp of stdExports.get(key) ?? []) {
      if (inScope(exp.name) || offered.has(exp.name)) continue;
      const edit = importInsertionEdit(source, key, exp.name, formatImport);
      if (edit === undefined) continue; // imported but not in scope; defensive
      offered.add(exp.name);
      out.push({
        name: exp.name,
        kind: exp.kind,
        detail: exp.detail,
        description: key,
        extraEdits: [edit],
      });
    }
  }
  return out;
};

// ---- organize imports (source.organizeImports) -------------------------------
//
// The per-statement rewrite behind the `source.organizeImports` code action.
// Semantics follow `vl fmt`'s canon, NOT TS's statement-reordering: fmt SORTS a
// statement's specifiers alphabetically and PRESERVES the order of the
// statements themselves, so organize does too — each import statement is
// rewritten in place (never merged with or moved past another), spelled by the
// real formatter when one is supplied so the result is exactly what fmt keeps.
//
// The design invariant is IDEMPOTENCE: a statement whose canonical spelling it
// already has, with no unused specifiers, yields NO edit — so on a clean file
// organize produces no edits at all, and `editor.codeActionsOnSave` is
// byte-stable (the server returns no action rather than an empty one).

/** Convert a 0-based LSP position to a char offset in `source` (clamped). */
const posToOffset = (
  source: string,
  pos: { line: number; character: number },
): number => {
  let offset = 0;
  for (let line = 0; line < pos.line; line++) {
    const nl = source.indexOf("\n", offset);
    if (nl < 0) return source.length;
    offset = nl + 1;
  }
  return Math.min(offset + pos.character, source.length);
};

/**
 * The edits that organize the imports of `source`:
 *
 *   - a specifier covered by an `unusedRanges` entry (the `unused-import` lint
 *     diagnostics' ranges — each starts inside exactly one specifier, whether
 *     it flags a plain name or an `x as y` alias) is dropped whole;
 *   - a statement with NO surviving specifier is deleted line-wise, trailing
 *     newline included, so no blank residue remains (`removeImportFix`'s
 *     deletion behaviour);
 *   - a statement whose surviving specifiers spell differently from the
 *     canonical form — unused dropped, specifiers fmt-sorted, whitespace
 *     normalised, a multi-line statement collapsed — is REPLACED by that form,
 *     spelled by `formatImport` (the seed's `formatSrc`) or an alphabetical
 *     hand-sort fallback;
 *   - a statement already canonical with nothing unused yields no edit.
 *
 * One edit per statement, computed against `source`, so the edits are disjoint
 * by construction and applicable as a single `WorkspaceEdit`. An empty result
 * means the file is already organized (the caller offers no action).
 */
export const organizeImportEdits = (
  source: string,
  unusedRanges: LspRange[],
  formatImport?: (stmt: string) => string | undefined,
): CompletionEdit[] => {
  const unusedOffsets = unusedRanges.map((r) => posToOffset(source, r.start));
  const edits: CompletionEdit[] = [];
  // Statement-spanning scan (`[^}]*` crosses newlines, keeping a multi-line
  // import whole) — the same shape `importInsertionEdit` walks. A bare
  // side-effect import (`import "…"`) has no specifiers and is never touched.
  const stmtRe = /import\s*\{([^}]*)\}\s*from\s*"([^"]*)"/g;
  for (let m = stmtRe.exec(source); m !== null; m = stmtRe.exec(source)) {
    const stmtStart = m.index;
    const stmtEnd = m.index + m[0].length;
    const list = m[1];
    const listStart = stmtStart + m[0].indexOf("{") + 1;

    // Comma-split the specifier list into content spans (absolute offsets) —
    // specifiers are flat (`name` / `name as local`), so a comma split is
    // exact. An all-whitespace segment (trailing comma) yields no specifier.
    const specs: { start: number; end: number; text: string }[] = [];
    const pushSeg = (from: number, to: number): void => {
      let s = from;
      let e = to;
      while (s < e && /\s/.test(list[s])) s++;
      while (e > s && /\s/.test(list[e - 1])) e--;
      if (e > s) {
        specs.push({
          start: listStart + s,
          end: listStart + e,
          text: list.slice(s, e).replace(/\s+/g, " "),
        });
      }
    };
    let segStart = 0;
    for (let i = 0; i < list.length; i++) {
      if (list[i] === ",") {
        pushSeg(segStart, i);
        segStart = i + 1;
      }
    }
    pushSeg(segStart, list.length);
    if (specs.length === 0) continue; // `import {} from "…"` — nothing to organize

    // A diagnostic's start sits inside exactly one specifier's content span
    // (the lint points at the specifier — its source name or alias local).
    const surviving = specs.filter(
      (sp) => !unusedOffsets.some((o) => o >= sp.start && o <= sp.end),
    );

    if (surviving.length === 0) {
      // Nothing left to import: delete the statement's whole line span,
      // trailing newline included (to column 0 of the next line, or to the end
      // of the last line when the file ends on the statement).
      const startLine = offsetToPos(source, stmtStart).line;
      const afterNl = source.indexOf("\n", stmtEnd);
      const end = afterNl >= 0
        ? { line: offsetToPos(source, afterNl).line + 1, character: 0 }
        : offsetToPos(source, source.length);
      edits.push({
        range: { start: { line: startLine, character: 0 }, end },
        newText: "",
      });
      continue;
    }

    const names = surviving.map((sp) => sp.text);
    const stmt = `import { ${names.join(", ")} } from "${m[2]}"`;
    const canonical = (formatImport?.(stmt + "\n") ??
      `import { ${[...names].sort().join(", ")} } from "${m[2]}"`).trimEnd();
    if (canonical === m[0]) continue; // already canonical, nothing unused
    edits.push({
      range: {
        start: offsetToPos(source, stmtStart),
        end: offsetToPos(source, stmtEnd),
      },
      newText: canonical,
    });
  }
  return edits;
};
