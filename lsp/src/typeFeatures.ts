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
export const semanticTokensDataFromWasm = (
  idents: IdentToken[],
  lexical: ExtLexicalToken[],
  extMembers: ExtMemberToken[],
): number[] => {
  const identTokens = identTokensByPos(idents);
  const merged: ClassifiedToken[] = [...identTokens.values()];
  for (const t of lexicalTokensFromExternal(lexical)) {
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
};

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
      detail: b.type.length > 0 ? b.type : undefined,
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
    detail: b.detail.length > 0 ? b.detail : undefined,
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
      detail: m.detail.length > 0 ? m.detail : undefined,
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
//   as from in step to then
const VL_HARD_KEYWORDS: readonly string[] = [
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

const VL_SOFT_KEYWORDS: readonly string[] = [
  "as",
  "from",
  "in",
  "step",
  "to",
  "then",
];

/**
 * Keyword completions for VL: all hard keywords (reserved by the lexer) plus
 * the contextual soft keywords (`as`, `from`, `in`, `step`, `to`, `then`).
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
