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

// ---- semantic tokens (D5) ---------------------------------------------------

// The legend. Order is the contract: token/modifier *indices* in the encoded
// stream refer back into these arrays, and the same legend is advertised to the
// client in `onInitialize`. Adding entries is safe (append only); reordering
// would silently mis-color every token.
export const SEMANTIC_TOKEN_TYPES = [
  "variable", // a local `let`/`const`
  "parameter", // a function parameter
  "function", // a function declaration / callee
  "type", // a `type` alias
] as const;

export const SEMANTIC_TOKEN_MODIFIERS = [
  "declaration", // the defining occurrence (`isDecl`), vs a use
] as const;

export const SEMANTIC_TOKEN_LEGEND = {
  tokenTypes: [...SEMANTIC_TOKEN_TYPES],
  tokenModifiers: [...SEMANTIC_TOKEN_MODIFIERS],
};

/** Map a binding kind to its index in {@link SEMANTIC_TOKEN_TYPES}. */
const tokenTypeIndex: Record<string, number> = {
  variable: 0,
  parameter: 1,
  function: 2,
  type: 3,
};

const DECLARATION_BIT = 1 << 0; // index 0 in SEMANTIC_TOKEN_MODIFIERS

/**
 * One classified identifier span, in 0-based LSP coordinates. Spans are
 * single-line (identifiers don't wrap); a defensive guard in
 * {@link encodeSemanticTokens} drops any that aren't.
 */
export type ClassifiedToken = {
  line: number; // 0-based
  char: number; // 0-based
  length: number;
  tokenType: number; // index into SEMANTIC_TOKEN_TYPES
  tokenModifiers: number; // bitset over SEMANTIC_TOKEN_MODIFIERS
};

/** Convert a 1-based VL span start to a 0-based token, if it's classifiable. */
const classify = (
  span: Context,
  kind: string,
  isDecl: boolean,
): ClassifiedToken | undefined => {
  const tokenType = tokenTypeIndex[kind];
  if (tokenType === undefined) return undefined;
  // Identifiers are single-line; skip anything spanning lines (shouldn't occur
  // for a name span, but the encoding below assumes one line per token).
  if (span.start.line !== span.stop.line) return undefined;
  const length = span.stop.column - span.start.column;
  if (length <= 0) return undefined;
  return {
    line: span.start.line - 1, // 1-based VL → 0-based LSP
    char: span.start.column,
    length,
    tokenType,
    tokenModifiers: isDecl ? DECLARATION_BIT : 0,
  };
};

/**
 * Classify every occurrence in `table` into a {@link ClassifiedToken}. Sorted
 * by (line, char) — the relative encoding {@link encodeSemanticTokens} requires
 * a non-decreasing position order.
 */
export const classifyTokens = (table: SymbolTable): ClassifiedToken[] => {
  const tokens: ClassifiedToken[] = [];
  for (const occ of table.occurrences) {
    const t = classify(occ.span, occ.binding.kind, occ.isDecl);
    if (t) tokens.push(t);
  }
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

/** Convenience: classify + encode a whole table in one call. */
export const semanticTokensData = (table: SymbolTable): number[] =>
  encodeSemanticTokens(classifyTokens(table));

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
 * Derive type inlay hints from a symbol table: one per *declaration* occurrence
 * (`isDecl`) of a `variable` or `parameter` binding that carries a type. The
 * hint sits just after the identifier and reads `: <type>`.
 *
 * `stringify` is injected (rather than importing `stringifyType` here) so this
 * stays a pure data transform and tests can pass a trivial stub.
 *
 * Limitation: the symbol table records `binding.type` for *every* binding but
 * not whether that type came from a *source annotation* (`let x: i32 = …`) or
 * was *inferred*. So we can't reliably suppress hints on already-annotated
 * bindings from the table alone; we hint all eligible declarations. (Suppressing
 * annotated ones would need the parser to record an `annotated` flag on the
 * binding — a compiler-core change.) Function/type declarations are skipped:
 * functions show their signature elsewhere and a `type` alias names its own RHS.
 */
export const deriveInlayHints = (
  table: SymbolTable,
  stringify: (type: VLType) => string,
  range?: LspRange,
): TypeInlayHint[] => {
  const hints: TypeInlayHint[] = [];
  for (const occ of table.occurrences) {
    if (!occ.isDecl) continue;
    const { binding } = occ;
    if (binding.kind !== "variable" && binding.kind !== "parameter") continue;
    if (binding.type === undefined) continue;
    // Place the hint at the end of the declaring identifier.
    const end: Position = occ.span.stop;
    const line = end.line - 1; // 1-based VL → 0-based LSP
    const char = end.column;
    if (range && !posInRange(line, char, range)) continue;
    hints.push({
      line,
      char,
      label: `: ${stringify(binding.type)}`,
      name: binding.name,
    });
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
};

/**
 * Wrap a stringified type in a fenced `vital` code block so the LSP client
 * syntax-highlights it. A completion item's `detail` is plain text per the LSP
 * spec (so the type there renders unstyled); the markdown `documentation` built
 * from this renders highlighted via the same TextMate grammar the hover uses.
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
