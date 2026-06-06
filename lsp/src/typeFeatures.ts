// Pure, runtime-agnostic helpers behind the type-aware editor features
// (inlay hints, semantic tokens) the LSP layers on top of the D2 symbol table.
//
// These live in their own module — rather than in `server.ts` — for one reason:
// `server.ts` imports the Node-only `vscode-languageserver` package and calls
// `createConnection().listen()` at module load, so it can't be imported by a
// Deno unit test. Everything here depends only on the compiler's `SymbolTable`
// (`../../compiler/symbols.ts`), so `tests/lsp_type_features_test.ts` drives it
// directly. `server.ts` does the LSP request/response plumbing around it.
//
// Position convention: VL spans (from the symbol table) are 1-based line /
// 0-based column. The LSP wire format is 0-based line / 0-based character. To
// keep these helpers independent of the LSP enums and easy to assert on, they
// emit *plain* 0-based positions; `server.ts` wraps the results in the real
// `InlayHint` / `SemanticTokens` shapes.

import type {
  Context,
  Position,
  Scope,
  VLObjectType,
  VLType,
} from "../../compiler/ast.ts";
import type { BindingKind, SymbolTable } from "../../compiler/symbols.ts";
import type { Token, TokenKind } from "../../compiler/lexer.ts";

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

/** Map a binding kind to its index in {@link SEMANTIC_TOKEN_TYPES}. */
const bindingTokenType: Record<BindingKind, number> = {
  variable: TT.variable,
  parameter: TT.parameter,
  function: TT.function,
  type: TT.type,
};

const DECLARATION_BIT = 1 << 0; // index 0 in SEMANTIC_TOKEN_MODIFIERS

/**
 * One classified token span, in 0-based LSP coordinates. Spans are single-line
 * (a defensive guard in {@link classifyLexicalTokens} / the symbol-table path
 * drops any that aren't, since the encoding below assumes one line per token).
 */
export type ClassifiedToken = {
  line: number; // 0-based
  char: number; // 0-based
  length: number;
  tokenType: number; // index into SEMANTIC_TOKEN_TYPES
  tokenModifiers: number; // bitset over SEMANTIC_TOKEN_MODIFIERS
};

/** Convert a 1-based VL span start to a 0-based single-line token, or undefined. */
const spanToken = (
  span: Context,
  tokenType: number,
  tokenModifiers: number,
): ClassifiedToken | undefined => {
  // Skip anything spanning lines — the relative encoding assumes one line per
  // token. (Identifiers/keywords/numbers never wrap; a multi-line string is
  // dropped rather than mis-encoded.)
  if (span.start.line !== span.stop.line) return undefined;
  const length = span.stop.column - span.start.column;
  if (length <= 0) return undefined;
  return {
    line: span.start.line - 1, // 1-based VL → 0-based LSP
    char: span.start.column,
    length,
    tokenType,
    tokenModifiers,
  };
};

/**
 * Classify identifier occurrences from the symbol table — the semantically
 * accurate path. A name that resolves to a function declaration becomes a
 * `function` token, a type-position name a `type`, etc., which a purely lexical
 * pass (every `ID` looks the same) can't distinguish. Declaration occurrences
 * carry the `declaration` modifier.
 *
 * Returned keyed by an `<line>:<char>` position string so the lexical pass can
 * defer to these for any identifier the symbol table already resolved (and only
 * colour the leftover `ID`s — builtins, members — itself).
 */
const classifySymbolTokens = (
  table: SymbolTable,
): Map<string, ClassifiedToken> => {
  const byPos = new Map<string, ClassifiedToken>();
  for (const occ of table.occurrences) {
    const t = spanToken(
      occ.span,
      bindingTokenType[occ.binding.kind],
      occ.isDecl ? DECLARATION_BIT : 0,
    );
    if (t) byPos.set(`${t.line}:${t.char}`, t);
  }
  return byPos;
};

/**
 * The token type for a lexer {@link TokenKind}, or `undefined` for kinds we
 * don't colour (whitespace-like structural tokens: `NEWLINE`, `EOF`, brackets,
 * commas, dots, colons — these are handled fine by the TextMate grammar and
 * carry no semantic weight). `ID` is intentionally absent: identifiers are
 * resolved by the symbol-table pass; a leftover `ID` (a builtin like `i32`, a
 * member name) gets no semantic token and falls back to the grammar.
 */
const lexicalTokenType = (kind: TokenKind): number | undefined => {
  switch (kind) {
    case "STRING":
      return TT.string;
    case "NUMBER":
      return TT.number;
    case "TRUE":
    case "FALSE":
    case "NULL":
      return TT.boolean;
    // Keywords (excluding the literal keywords handled above).
    case "FUNCTION":
    case "IF":
    case "THEN":
    case "ELSE":
    case "ELSEIF":
    case "WHILE":
    case "FOR":
    case "TO":
    case "STEP":
    case "IN":
    case "CONST":
    case "LET":
    case "RETURN":
    case "IS":
    case "AWAIT":
    case "BREAK":
    case "CONTINUE":
    case "FROM":
    case "TYPE":
      return TT.keyword;
    // Operators (arithmetic / logical / comparison / nullish). Pure punctuation
    // (parens, braces, brackets, comma, dot, colon) is deliberately omitted.
    case "PLUS":
    case "MINUS":
    case "STAR":
    case "DIV":
    case "MOD":
    case "CARET":
    case "EQUAL":
    case "PLUSPLUS":
    case "MINUSMINUS":
    case "AND":
    case "OR":
    case "EXCLAMATION":
    case "QUESTION_DOT":
    case "QUESTION_QUESTION":
    case "EQUAL_TO":
    case "NOT_EQUAL_TO":
    case "GREATER_THAN":
    case "GREATER_THAN_OR_EQUAL_TO":
    case "LESS_THAN":
    case "LESS_THAN_OR_EQUAL_TO":
    case "PIPE":
    case "AMPERSAND":
      return TT.operator;
    default:
      return undefined;
  }
};

/**
 * Classify the lexer token stream into {@link ClassifiedToken}s for literals,
 * keywords, and operators. Identifiers are skipped here — the symbol-table pass
 * ({@link classifySymbolTokens}) classifies them more accurately. Comments are
 * recovered separately ({@link commentTokens}) because the lexer drops them as
 * trivia.
 */
const classifyLexicalTokens = (tokens: Token[]): ClassifiedToken[] => {
  const out: ClassifiedToken[] = [];
  for (const tok of tokens) {
    const tokenType = lexicalTokenType(tok.kind);
    if (tokenType === undefined) continue;
    const t = spanToken(tok, tokenType, 0);
    if (t) out.push(t);
  }
  return out;
};

/**
 * Recover `//` line comments as `comment` tokens by scanning the source — the
 * lexer drops them as trivia (and never records doc comments' spans), so they're
 * not in the token stream. We scan line-by-line for `//` that is NOT inside a
 * string literal, colouring from the `//` to end of line. This is a lightweight
 * heuristic: it tracks single/double-quoted string state on each line so a `//`
 * inside `"http://…"` isn't mistaken for a comment, but it does not handle a
 * string that spans multiple lines (rare; a worst case mis-colours a comment-
 * like run inside such a string, never breaks encoding).
 */
const commentTokens = (source: string): ClassifiedToken[] => {
  const out: ClassifiedToken[] = [];
  const lines = source.split("\n");
  for (let line = 0; line < lines.length; line++) {
    const text = lines[line];
    let quote: string | null = null;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (quote) {
        if (c === "\\") {
          i++; // skip the escaped char
        } else if (c === quote) {
          quote = null;
        }
        continue;
      }
      if (c === '"' || c === "'") {
        quote = c;
        continue;
      }
      if (c === "/" && text[i + 1] === "/") {
        out.push({
          line,
          char: i,
          length: text.length - i,
          tokenType: TT.comment,
          tokenModifiers: 0,
        });
        break; // rest of line is the comment
      }
    }
  }
  return out;
};

/**
 * Classify a whole document into {@link ClassifiedToken}s, merging the
 * semantically-accurate symbol-table pass (identifiers → variable/parameter/
 * function/type) with the lexical pass (literals/keywords/operators) and
 * recovered comments. Where both passes cover the same position the symbol-table
 * classification wins (it carries the real binding kind + declaration modifier).
 *
 * Sorted by (line, char) — the relative encoding {@link encodeSemanticTokens}
 * requires a non-decreasing position order.
 */
export const classifyDocument = (
  table: SymbolTable,
  tokens: Token[],
  source: string,
): ClassifiedToken[] => {
  const symbolTokens = classifySymbolTokens(table);
  const merged: ClassifiedToken[] = [...symbolTokens.values()];
  for (const t of classifyLexicalTokens(tokens)) {
    // A symbol-table classification at this exact position takes precedence.
    if (!symbolTokens.has(`${t.line}:${t.char}`)) merged.push(t);
  }
  merged.push(...commentTokens(source));
  merged.sort((a, b) => a.line - b.line || a.char - b.char);
  return merged;
};

/**
 * Classify only the symbol-table identifier occurrences (variable/parameter/
 * function/type). Retained for the focused unit tests and as the
 * semantically-accurate core; full-document classification is
 * {@link classifyDocument}.
 */
export const classifyTokens = (table: SymbolTable): ClassifiedToken[] => {
  const tokens = [...classifySymbolTokens(table).values()];
  tokens.sort((a, b) => a.line - b.line || a.char - b.char);
  return tokens;
};

/**
 * Delta-encode classified tokens into the flat `data` array LSP semantic tokens
 * use: groups of five `[deltaLine, deltaChar, length, tokenType, tokenModifiers]`.
 *
 * `deltaLine` is relative to the previous token's line; `deltaChar` is relative
 * to the previous token's char *only when on the same line*, otherwise it's the
 * absolute char. Tokens must already be sorted (see {@link classifyTokens}).
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
 * Convenience: classify a whole document (symbol-table identifiers + lexical
 * literals/keywords/operators + comments) and delta-encode it into the flat LSP
 * `data` array in one call. This is what `server.ts` returns for
 * `textDocument/semanticTokens/full`.
 */
export const semanticTokensData = (
  table: SymbolTable,
  tokens: Token[],
  source: string,
): number[] => encodeSemanticTokens(classifyDocument(table, tokens, source));

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
 * Whether a type is an unresolved inference hole — an `Infer` placeholder or a
 * bare `Unknown` (`any`) — for which a hint would read `: I<…>` / `: any`. Those
 * are noise, not the concrete inferred type the feature promises (they occur for
 * an unconstrained generic parameter), so we skip hinting them.
 */
const isHole = (type: VLType): boolean =>
  type.type === "Infer" || type.type === "Unknown";

/**
 * Derive type inlay hints from a symbol table: surface the *inferred* type at
 * each declaration the user left unannotated. Three positions:
 *   - a `let`/`const` binding (`variable`) with no `: T` — `name: <type>`;
 *   - a function `parameter` with no `: T` — `name: <type>`;
 *   - a `function`'s omitted return type — `): <type>` after the param list.
 *
 * Crucially, a declaration the user *already annotated* gets NO hint — echoing
 * the written annotation is noise, the opposite of the feature's point. We detect
 * the annotation from the source text ({@link isAnnotated} / the return-gap scan)
 * since the symbol table records `binding.type` but not whether it was authored
 * or inferred. `source` is therefore required for suppression; without it (legacy
 * callers / pure-table tests) every eligible declaration is hinted.
 *
 * `stringify` is injected (rather than importing `stringifyType` here) so this
 * stays a pure data transform and tests can pass a trivial stub. A `type` alias
 * is never hinted (it names its own RHS).
 */
export const deriveInlayHints = (
  table: SymbolTable,
  stringify: (type: VLType) => string,
  range?: LspRange,
  source?: string,
): TypeInlayHint[] => {
  const lines = source !== undefined ? splitLines(source) : undefined;
  const hints: TypeInlayHint[] = [];

  const push = (pos: { line: number; char: number }, label: string, name: string) => {
    if (range && !posInRange(pos.line, pos.char, range)) return;
    hints.push({ line: pos.line, char: pos.char, label, name });
  };

  for (const occ of table.occurrences) {
    if (!occ.isDecl) continue;
    const { binding } = occ;
    if (binding.type === undefined) continue;

    if (binding.kind === "variable" || binding.kind === "parameter") {
      // Skip already-annotated bindings (the headline rule). Without `source`
      // we can't tell, so we hint all eligible declarations (legacy behaviour).
      if (lines && isAnnotated(lines, occ.span.stop)) continue;
      if (isHole(binding.type)) continue;
      push(toLsp(occ.span.stop), `: ${stringify(binding.type)}`, binding.name);
      continue;
    }

    if (binding.kind === "function" && binding.type.type === "Function") {
      // Return-type hint: only when the user omitted it, and only when we can
      // locate the param list's `)` from the source. Place it just after `)`.
      if (!lines) continue;
      if (isHole(binding.type.return)) continue;
      const close = closingParen(lines, occ.span.stop);
      if (!close) continue;
      // Annotated iff the next non-whitespace char after `)` is `:`.
      if (isAnnotated(lines, close)) continue;
      push(
        toLsp(close),
        `: ${stringify(binding.type.return)}`,
        binding.name,
      );
    }
  }
  return hints;
};

// ---- completion (D3) --------------------------------------------------------

/**
 * The semantic category of a completion candidate, in LSP-neutral terms (so this
 * module stays free of the `vscode-languageserver` enums — `server.ts` maps these
 * to `CompletionItemKind`). `"variable"` covers locals; `"parameter"` function
 * params; `"function"` callables; `"type"` `type` aliases and builtin types.
 */
export type CompletionKind = BindingKind;

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

/**
 * The markdown body shown in hover and in completion `documentation`: the
 * declaration's authored `///` doc-comment (rendered as markdown by the client),
 * then a blank line, then the fenced `vital` type block — so prose comes first
 * and the type reads beneath it. When `doc` is absent or blank, this is exactly
 * the bare type block ({@link typeMarkdown}), so undocumented declarations render
 * identically to before. When `typeStr` is empty (a documented binding with no
 * known type) the type fence is omitted and just the doc prose is returned.
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
): string => {
  const fence = typeStr === "" ? "" : typeMarkdown(typeStr, languageId);
  const trimmed = doc?.trim();
  if (!trimmed) return fence;
  return fence ? `${trimmed}\n\n${fence}` : trimmed;
};

/**
 * Classify a builtin (from `defaultScope`) by its `VLType`: a `Function` type is
 * a callable, anything else is treated as a `type` (the builtins are the numeric
 * /string *types* `i32`, `string`, … which are object types naming themselves).
 * Builtins carry no `BindingKind`, so we infer one from the type shape alone.
 */
const builtinKind = (type: VLType): CompletionKind =>
  type.type === "Function" ? "function" : "type";

/**
 * Scope-aware identifier completions at `pos` (roadmap D3 feature 1): every name
 * visible at the cursor — locals, parameters, functions, and `type` aliases —
 * plus the builtins from `defaultScope` (`builtins`), each tagged with its kind
 * and (when known) a type detail string.
 *
 * In-scope user names come from `SymbolTable.bindingsInScopeAt` (which honours
 * nesting + shadowing: an inner `let x` shadows an outer one, and a name whose
 * enclosing scope doesn't cover `pos` is excluded). A user binding shadows a
 * builtin of the same name. `pos` uses the symbol table's 1-based-line /
 * 0-based-column convention (`server.ts` bridges from the LSP position).
 *
 * `stringify` is injected (not imported) to keep this a pure transform, matching
 * the other helpers in this module.
 */
export const identifierCompletions = (
  table: SymbolTable,
  pos: Position,
  builtins: Scope,
  stringify: (type: VLType) => string,
): Completion[] => {
  const byName = new Map<string, Completion>();
  // Builtins first; user bindings (added next) overwrite same-named entries so a
  // local/param/function/type shadows a builtin in the suggestion list. The
  // `__name__` runtime intrinsics (`__store_i32__`, …) live in the same scope but
  // aren't surface syntax users write, so they're filtered out.
  for (const name of Object.keys(builtins)) {
    if (name.startsWith("__")) continue;
    const type = builtins[name];
    byName.set(name, { name, kind: builtinKind(type), detail: stringify(type) });
  }
  for (const binding of table.bindingsInScopeAt(pos)) {
    byName.set(binding.name, {
      name: binding.name,
      kind: binding.kind,
      detail: binding.type ? stringify(binding.type) : undefined,
      doc: binding.doc,
    });
  }
  return [...byName.values()];
};

/**
 * Member completions for an object type (roadmap D3 feature 2): the field/method
 * names declared on `objectType`, each with a type detail. Only properties whose
 * key is a string literal are surfaced — those are the addressable `.member`
 * names. Operator entries (whose key is a *union* of operator string literals
 * like `"+"`/`"=="`) and index signatures (numeric/`i32` keys) are skipped: they
 * aren't dot-accessible identifiers. A method (a property whose type is a
 * `Function`) is tagged `"function"`; a plain field is a `"variable"`.
 */
export const memberCompletions = (
  objectType: VLObjectType,
  stringify: (type: VLType) => string,
): Completion[] => {
  const out: Completion[] = [];
  const seen = new Set<string>();
  for (const prop of objectType.properties) {
    if (prop.name.type !== "StringLiteral") continue;
    const name = prop.name.value;
    // Skip pure operator names (`+`, `==`, …) — not dot-accessible identifiers.
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) continue;
    if (seen.has(name)) continue;
    seen.add(name);
    out.push({
      name,
      kind: prop.type.type === "Function" ? "function" : "variable",
      detail: stringify(prop.type),
    });
  }
  return out;
};

/**
 * Resolve a receiver expression's *object* type so {@link memberCompletions} can
 * read its members — best-effort for the simple `name.` receiver (the common
 * case; resolving an arbitrary expression's type at a cursor needs a deeper
 * compiler hook, see the D3 report).
 *
 * `receiver` is the identifier just before the `.`. We find its type from the
 * symbol table (an in-scope binding) or from the program `scope` (a builtin /
 * top-level name), then soften it to an object: a bare `Object` is returned
 * directly; a `Nullable<Object>` (an `x?.`-style receiver) unwraps to its object;
 * an `Alias` is followed one hop through `scope` (e.g. `let p: Point` →
 * `scope.Point` → the object). Returns `undefined` when no object type is found.
 */
export const receiverObjectType = (
  receiver: string,
  table: SymbolTable,
  pos: Position,
  scope: Scope,
): VLObjectType | undefined => {
  const fromBinding = table
    .bindingsInScopeAt(pos)
    .find((b) => b.name === receiver)?.type;
  const type = fromBinding ?? scope[receiver];
  return type ? asObjectType(type, scope) : undefined;
};

/** Soften a type to an object: unwrap `Nullable`, follow one `Alias` hop. */
const asObjectType = (
  type: VLType,
  scope: Scope,
  depth = 0,
): VLObjectType | undefined => {
  if (depth > 8) return undefined; // guard against a cyclic alias chain
  if (type.type === "Object") return type;
  if (type.type === "Nullable") return asObjectType(type.subType, scope, depth + 1);
  if (type.type === "Alias") {
    const target = scope[type.name];
    return target ? asObjectType(target, scope, depth + 1) : undefined;
  }
  return undefined;
};
