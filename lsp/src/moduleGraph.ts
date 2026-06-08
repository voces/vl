// Module-aware analysis for the LSP (roadmap cross-file LSP / H0 phase 3).
//
// The single-file LSP path (`compile(text)` / `checkOnly(text)`) tokenizes and
// type-checks ONE file against `defaultScope()`, so an `import { foo } from
// "./x"` never resolves — `foo` is reported "undeclared" and genuine import
// errors (bad path, not-exported, cycle) are never surfaced. The real compiler
// understands modules via the graph driver (`compiler/modules.ts`): it reads
// every reachable module through an injected `ModuleReader`, parses each against
// `defaultScope()` SEEDED with its imports' resolved types, and validates each
// import resolves to an actually-`export`ed name.
//
// This module brings that graph awareness to the LSP WITHOUT the per-module
// span-attribution problem that a naive "run the whole merged program and filter
// diagnostics by file" would hit (the merged program concatenates modules and
// mangles names, and `loadProgram` returns a single flat diagnostics array with
// no module key on each diagnostic). Instead we resolve the CURRENT file's
// imports here — reading siblings through the same open-buffer/disk reader — and
//   1. build an `importedScope` mapping each imported LOCAL name to its resolved
//      type (exactly how `loadProgram` seeds an importer's `initialScope`), so
//      the current file can be re-parsed with imports treated as if declared
//      locally (no spurious "undeclared"; hover/completion get the real types);
//   2. collect the genuine import errors (unresolvable path, not-exported,
//      unsupported specifier, import cycle) — every one of which is attributed to
//      an import statement in the CURRENT file, so its range is already correct
//      for the current document. We never surface a sibling file's body
//      diagnostics on the current document (those belong to that file's own
//      editor view), which is exactly what sidesteps cross-module span mapping.
//
// Runtime: the bundled server is node/esbuild, so disk reads use `node:fs`. The
// reader prefers OPEN document buffers (unsaved edits are seen) and falls back to
// disk. Specifier resolution mirrors `compiler/modules.ts`'s `resolveSpecifier`.

import {
  type ModuleReader,
  resolveSpecifier,
} from "../../compiler/modules.ts";
import { tokenize } from "../../compiler/lexer.ts";
import { parseProgram } from "../../compiler/parser.ts";
import { defaultScope } from "../../compiler/defaultScope.ts";
import {
  parseSymbols,
  rangeFromCtx,
  stringifyType,
  type SymbolTable,
  type VLDiagnostic,
  type VLRange,
} from "../../compiler/compile.ts";
import { lint } from "../../compiler/lint.ts";
import type {
  NodeSpans,
  ParseErrors,
  Scope,
  VLProgramNode,
  VLImportNode,
  VLType,
} from "../../compiler/ast.ts";

// A minimal view of the LSP `TextDocuments` manager — just what the reader needs
// to consult open buffers. Kept structural so tests can pass a tiny stand-in and
// so we don't import the Node-only `vscode-languageserver` here.
export type OpenDocuments = {
  get(uri: string): { getText(): string } | undefined;
};

// ---- file:// URI ↔ filesystem path -----------------------------------------

/**
 * Convert a `file://` URI to a filesystem path. Handles the `file:///abs/path`
 * form (three slashes → leading `/`) and percent-decoding. Non-`file:` URIs are
 * returned unchanged (callers treat them as opaque keys). Mirrors the subset of
 * `vscode-uri`'s `fsPath` we need without the dependency.
 */
export const uriToPath = (uri: string): string => {
  if (!uri.startsWith("file://")) return uri;
  let path = uri.slice("file://".length);
  // `file:///abs` → authority empty, path `/abs`. A non-empty authority (rare on
  // local files) is dropped — we only handle local files.
  const slash = path.indexOf("/");
  if (slash > 0) path = path.slice(slash);
  try {
    return decodeURIComponent(path);
  } catch {
    return path;
  }
};

/** Convert a filesystem path to a `file://` URI (percent-encoding each segment). */
export const pathToUri = (path: string): string => {
  const encoded = path.split("/").map((seg) => encodeURIComponent(seg)).join(
    "/",
  );
  return `file://${encoded}`;
};

// ---- workspace ModuleReader -------------------------------------------------

/**
 * Build a {@link ModuleReader} keyed on FILESYSTEM PATHS that prefers the LSP's
 * open document buffers (so unsaved edits are analyzed) and falls back to reading
 * the `.vl` file from disk. `documents` is the LSP `TextDocuments` manager (or a
 * test stand-in); `readDisk` is injectable so tests can avoid touching the real
 * filesystem (defaults to `node:fs`'s `readFileSync`).
 *
 * Keys are plain filesystem paths (what `resolveSpecifier` produces for relative
 * specifiers resolved from a path-shaped `fromKey`). Open buffers are keyed by
 * `file://` URI, so the reader converts the path key back to a URI to consult
 * them.
 */
export const makeWorkspaceReader = (
  documents: OpenDocuments,
  readDisk: (path: string) => string | undefined = defaultReadDisk,
): ModuleReader =>
(key: string): string | undefined => {
  // 1. Open buffer (unsaved edits win over disk).
  const open = documents.get(pathToUri(key));
  if (open) return open.getText();
  // 2. Disk fallback.
  return readDisk(key);
};

// `node:fs` is loaded via `createRequire` rather than a static `import … from
// "node:fs"`: a static node-module import makes `deno check` demand `@types/node`
// (not a dependency here), whereas `createRequire` keeps the type surface to our
// own minimal `FsModule` shape. esbuild (`--platform=node`) bundles this fine —
// `node:fs` is a runtime built-in. The result is cached after first load.
type FsModule = { readFileSync(path: string, encoding: string): string };
// The server bundle's banner (`lsp/deno.json` build task) defines a `require`
// from `createRequire(import.meta.url)`, available at runtime in the bundled
// Node server. Declaring it (rather than `import … from "node:fs"`) keeps
// `deno check` from demanding `@types/node` — which isn't a dependency here. In
// the bundled server `require("node:fs")` resolves the built-in; under Deno (the
// tests) the default reader is replaced by an injected one, so this path is only
// exercised in Node where `require` exists.
declare const require: ((id: string) => unknown) | undefined;
let fsModule: FsModule | undefined;
const loadFs = (): FsModule | undefined => {
  if (fsModule) return fsModule;
  if (typeof require !== "function") return undefined;
  try {
    // The specifier is assembled at runtime so static analysis can't treat it as
    // a module reference (which would make `deno check` resolve `@types/node`).
    // esbuild still bundles `node:fs` as the runtime built-in it is.
    const spec = "node:" + "fs";
    fsModule = require(spec) as FsModule;
    return fsModule;
  } catch {
    return undefined;
  }
};

const defaultReadDisk = (path: string): string | undefined => {
  try {
    const fs = loadFs();
    return fs ? fs.readFileSync(path, "utf8") : undefined;
  } catch {
    return undefined; // missing/unreadable → the resolver reports it as unresolvable
  }
};

// ---- entry-file import resolution ------------------------------------------

/** What the LSP needs from the graph to analyze ONE open file. */
export type EntryAnalysis = {
  /**
   * Each imported LOCAL name → its resolved type, to seed the current file's
   * parse scope so imported references type-check (no spurious "undeclared").
   * Empty for a file with no (resolvable) imports.
   */
  importedScope: Scope;
  /**
   * Genuine import-level diagnostics for the CURRENT file: unresolvable path,
   * not-exported name, unsupported specifier, import cycle. Each is attributed to
   * an import statement IN the current file, so its range is already correct for
   * the current document.
   */
  diagnostics: VLDiagnostic[];
  /** True when the current file has at least one `import` statement. */
  hasImports: boolean;
};

const importError = (
  node: VLImportNode,
  spans: NodeSpans,
  message: string,
): VLDiagnostic => {
  const ctx = spans.get(node);
  return {
    message,
    severity: "error",
    source: "vital",
    range: ctx
      ? rangeFromCtx(ctx)
      : { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } },
  };
};

/**
 * Resolve the CURRENT file's imports through the workspace reader, returning the
 * imported names' types (to seed its parse) and any genuine import errors. The
 * heavy lifting — cycle detection across the whole graph, transitive type
 * resolution — is delegated to the compiler's `loadProgram` by reading each
 * direct dependency's own exports; a dependency's exports are typed against ITS
 * imports during ITS parse, so a one-level read here yields the same resolved
 * export types `loadProgram` would seed.
 *
 * `entryKey` is the current file's filesystem path; `read` resolves any module
 * key (open buffer or disk) to source.
 *
 * Cycle handling: a direct self/back import to a module already on the load path
 * is reported as a cycle. Deeper cycles surface when that dependency is itself
 * opened (its own LSP view), so we never need to walk the full graph here.
 */
export const analyzeEntryImports = async (
  entryKey: string,
  read: ModuleReader,
): Promise<EntryAnalysis> => {
  const importedScope: Scope = {};
  const diagnostics: VLDiagnostic[] = [];

  const source = await read(entryKey);
  if (source === undefined) {
    // The current file isn't readable through the reader (shouldn't happen — it's
    // the open document). Nothing to seed; let the single-file path run.
    return { importedScope, diagnostics, hasImports: false };
  }

  const { tokens } = tokenize(source);
  const [program, , , spans] = parseProgram(tokens, defaultScope());
  const imports = program.moduleImports ?? [];
  if (imports.length === 0) {
    return { importedScope, diagnostics, hasImports: false };
  }

  for (const imp of imports) {
    const depKey = resolveSpecifier(imp.specifier, entryKey);
    if (depKey === undefined) {
      diagnostics.push(importError(
        imp,
        spans,
        `Unsupported import specifier "${imp.specifier}" — only relative ` +
          `paths (\`./\`, \`../\`) are supported`,
      ));
      continue;
    }
    if (depKey === entryKey) {
      diagnostics.push(importError(
        imp,
        spans,
        `Import cycle detected through "${imp.specifier}" (module imports itself)`,
      ));
      continue;
    }
    const depSource = await read(depKey);
    if (depSource === undefined) {
      diagnostics.push(importError(
        imp,
        spans,
        `Cannot resolve import "${imp.specifier}" (no module \`${depKey}\`)`,
      ));
      continue;
    }
    // Parse the dependency to read its export surface. Seed ITS scope with ITS
    // own imports' types so an export whose type references a transitive import
    // still resolves — recursing through the same reader (guarded against cycles).
    const depExports = await resolveModuleExports(depKey, read, new Set([entryKey]));
    for (const spec of imp.specifiers) {
      const exp = depExports[spec.name];
      if (!exp) {
        diagnostics.push(importError(
          imp,
          spans,
          `"${spec.name}" is not exported by "${imp.specifier}"`,
        ));
        continue;
      }
      importedScope[spec.local] = exp;
    }
  }

  return { importedScope, diagnostics, hasImports: true };
};

/**
 * The resolved export-name → type map of the module at `key`, parsed against its
 * own imports' types. `onPath` carries the modules currently being resolved so a
 * cyclic export reference terminates (the cycle itself is reported at the import
 * site by {@link analyzeEntryImports}); a re-entry returns the module's exports
 * typed against an empty import scope rather than looping.
 */
const resolveModuleExports = async (
  key: string,
  read: ModuleReader,
  onPath: Set<string>,
): Promise<Record<string, VLType>> => {
  const source = await read(key);
  if (source === undefined) return {};

  const { tokens } = tokenize(source);
  // First pass against a bare scope to discover this module's imports.
  const [probe] = parseProgram(tokens, defaultScope());

  const initialScope = defaultScope();
  if (!onPath.has(key)) {
    const nextPath = new Set(onPath).add(key);
    for (const imp of probe.moduleImports ?? []) {
      const depKey = resolveSpecifier(imp.specifier, key);
      if (depKey === undefined || onPath.has(depKey)) continue;
      const depExports = await resolveModuleExports(depKey, read, nextPath);
      for (const spec of imp.specifiers) {
        const t = depExports[spec.name];
        if (t) initialScope[spec.local] = t;
      }
    }
  }

  const [program] = parseProgram(tokenize(source).tokens, initialScope);
  const out: Record<string, VLType> = {};
  for (const exp of Object.values(program.moduleExports ?? {})) {
    out[exp.name] = exp.type;
  }
  return out;
};

// ---- graph-aware check (the diagnostics + AST/symbols the LSP needs) ---------

/**
 * A parser/typecheck `ParseErrors` → neutral `VLDiagnostic`. Mirrors the private
 * `diagnosticFromError` in `compile.ts` (which isn't exported); kept aligned with
 * it so graph-seeded diagnostics read identically to single-file ones.
 */
const diagnosticFromError = (error: ParseErrors): VLDiagnostic => {
  const base = {
    severity: "error" as const,
    range: rangeFromCtx(error.ctx),
    code: error.code,
    source: "vital" as const,
  };
  switch (error.type) {
    case "Redeclaration":
      return { ...base, message: `Syntax error: redeclared ${error.name}` };
    case "Undeclared":
      return { ...base, message: `Syntax error: undeclared ${error.name}` };
    case "Type":
      return {
        ...base,
        message: `Type error: expected ${
          stringifyType(error.left, new Set(), Infinity)
        }, got ${stringifyType(error.right, new Set(), Infinity)}`,
      };
    case "UnmatchedParameter":
      return { ...base, message: `Type error: unmatched parameter` };
    case "Syntax":
      return {
        ...base,
        severity: error.severity ?? "error",
        message: error.message,
      };
    case "Property":
      return {
        ...base,
        message: `Unknown property \`${
          stringifyType(error.property).replace(/^"(.*)"$/, "$1")
        }\``,
      };
    default:
      return { ...base, message: `Unhandled error: ${JSON.stringify(error)}` };
  }
};

/** The graph-aware analogue of `checkOnly`'s result for ONE open document. */
export type GraphCheckResult = {
  ast: VLProgramNode;
  diagnostics: VLDiagnostic[];
  symbols: SymbolTable;
  spans: NodeSpans;
  /** Each imported LOCAL name → its resolved type (folded into `ast.scope`). */
  importedScope: Scope;
};

/**
 * Module-aware front end for a single open document: tokenize + parse the CURRENT
 * file against `defaultScope()` SEEDED with its imports' resolved types (so
 * imported references type-check as if declared locally — no spurious
 * "undeclared"), then fold in the import-level diagnostics (bad path,
 * not-exported, cycle). Lint runs only when there are no error diagnostics, same
 * as `checkOnly`.
 *
 * A file with NO imports produces an empty `importedScope` and behaves exactly as
 * the single-file `checkOnly` (same scope, same diagnostics) — the no-regression
 * guarantee for the common case.
 *
 * `entryKey` is the document's filesystem path; `read` resolves sibling modules
 * (open buffer or disk). Async because resolving siblings reads other files.
 */
export const checkDocument = async (
  source: string,
  entryKey: string,
  read: ModuleReader,
): Promise<GraphCheckResult> => {
  const { importedScope, diagnostics: importDiagnostics } =
    await analyzeEntryImports(entryKey, read);

  // Seed the parse scope with builtins + imported names' resolved types.
  const initialScope: Scope = { ...defaultScope(), ...importedScope };
  const { tokens, diagnostics } = tokenize(source);
  const [ast, errors, symbols, spans] = parseProgram(tokens, initialScope);
  for (const error of errors) diagnostics.push(diagnosticFromError(error));
  // Import errors (the genuine ones) join the file's own diagnostics.
  for (const d of importDiagnostics) diagnostics.push(d);

  // Lint only when clean of errors — matches `checkOnly`.
  if (!diagnostics.some((d) => d.severity === "error")) {
    for (const d of lint(ast.statements, symbols, spans)) diagnostics.push(d);
  }

  return { ast, diagnostics, symbols, spans, importedScope };
};

// ---- cross-file name → source resolution -----------------------------------
//
// Powers cross-file go-to-definition (`onDefinition`) and cross-import doc-xref
// links (`buildDocRefResolver`): given a LOCAL name used in the current file,
// decide whether it is an IMPORTED binding and, if so, locate the EXPORTING
// sibling module + the span of the export's declaration there.
//
// Why the symbol table (not `VLModuleExport`): a `VLModuleExport` carries the
// export's resolved TYPE but not the span of its declaring identifier. The
// declaration span lives in the symbol table (`Binding.decl`), stamped with
// `binding.exported === true` for an `export`ed top-level binding. So we parse
// the sibling with `parseSymbols` and find the exported binding whose name
// matches the import's EXPORTED name (the `name` side of a `{ name as local }`
// specifier — `local` is what the importer sees, `name` is what the sibling
// declares).

/** A resolved cross-file source location: the exporting module + decl range. */
export type CrossFileSource = {
  /** The exporting module's filesystem key (what `resolveSpecifier` produced). */
  key: string;
  /** The exporting module's `file://` URI (for an LSP `Location` / xref link). */
  uri: string;
  /** The export declaration's range, in 0-based LSP coordinates. */
  range: VLRange;
};

/**
 * For each LOCAL imported name in `entrySource`, the sibling source location of
 * its export declaration — i.e. `{ add: <util.vl#decl-of-add> }`. Names whose
 * import is unresolvable (bad specifier, missing module, not-exported) are
 * omitted. The current file's own (non-imported) bindings are NOT included; the
 * single-file symbol table already resolves those.
 *
 * `entryKey` is the current file's filesystem path; `read` resolves siblings
 * (open buffer or disk). One level deep — exactly the imports written in the
 * current file — which is all go-to-def / doc-xref on an imported name needs.
 */
export const importedNameSources = async (
  entrySource: string,
  entryKey: string,
  read: ModuleReader,
): Promise<Record<string, CrossFileSource>> => {
  const out: Record<string, CrossFileSource> = {};
  const { tokens } = tokenize(entrySource);
  const [program] = parseProgram(tokens, defaultScope());
  const imports = program.moduleImports ?? [];
  if (imports.length === 0) return out;

  // Cache a sibling's exported-name → decl range so several imports from the
  // same module parse it once.
  const exportsByKey = new Map<string, Record<string, VLRange>>();

  for (const imp of imports) {
    const depKey = resolveSpecifier(imp.specifier, entryKey);
    if (depKey === undefined || depKey === entryKey) continue;
    let exported = exportsByKey.get(depKey);
    if (exported === undefined) {
      const depSource = await read(depKey);
      exported = depSource === undefined
        ? {}
        : exportedDeclRanges(depSource);
      exportsByKey.set(depKey, exported);
    }
    for (const spec of imp.specifiers) {
      const range = exported[spec.name];
      if (range === undefined) continue; // not-exported / unresolvable
      out[spec.local] = { key: depKey, uri: pathToUri(depKey), range };
    }
  }
  return out;
};

/**
 * Resolve ONE local imported name to its sibling source location, or `undefined`
 * when the name isn't an (resolvable) imported binding. Thin convenience over
 * {@link importedNameSources} for a single lookup.
 */
export const importedNameSource = async (
  name: string,
  entrySource: string,
  entryKey: string,
  read: ModuleReader,
): Promise<CrossFileSource | undefined> =>
  (await importedNameSources(entrySource, entryKey, read))[name];

/**
 * The exported-name → declaration range map for a module's source: every
 * top-level binding that carried an `export` modifier, keyed by its declared
 * (exported) name, valued by the 0-based LSP range of its declaring identifier.
 *
 * Driven by the symbol table's `exported` bindings: `parseSymbols` records a
 * `Binding` per declaration with `binding.exported === true` for an `export`ed
 * top-level binding and `binding.decl` the span of its name. We pick the
 * declaration occurrence (`isDecl`) so the range points at the definition, not a
 * later use.
 */
const exportedDeclRanges = (source: string): Record<string, VLRange> => {
  const symbols = parseSymbols(source);
  const out: Record<string, VLRange> = {};
  for (const occ of symbols.occurrences) {
    if (!occ.isDecl) continue;
    const { binding } = occ;
    if (!binding.exported) continue;
    // First decl wins (a redeclaration is a separate error surfaced elsewhere).
    if (out[binding.name] === undefined) out[binding.name] = rangeFromCtx(binding.decl);
  }
  return out;
};

// ---- cross-file find-references --------------------------------------------
//
// Scope (deliberately bounded — DOCUMENTED, not a full-disk crawl): references to
// a symbol are searched in the CURRENT file plus every OTHER OPEN document. We do
// NOT crawl the whole workspace from disk: that would require enumerating and
// parsing every `.vl` file (an unbounded, potentially slow filesystem walk with
// no project-root manifest to scope it), and the LSP only holds authoritative,
// unsaved-edit-aware text for the documents the editor has OPEN. Searching open
// documents is sound (their text is current) and cheap (bounded by the editor
// session). A reference in an unopened sibling on disk is not reported; the plan
// to extend to a disk crawl is recorded in ROADMAP.
//
// A symbol's identity across files is its CANONICAL export: the
// `(exportingKey, exportedName)` pair. Within the exporting module the symbol is
// the local declaration of `exportedName`; in an importing module it's whatever
// LOCAL name aliases that export (`import { exportedName as local }`). So we
// resolve the cursor to a canonical export, then, per open document, find the
// local name that denotes it and collect that binding's occurrences.

/** A located reference: the document URI + the occurrence's 0-based range. */
export type CrossFileReference = { uri: string; range: VLRange };

/** One open document the references search ranges over. */
export type OpenDocument = { uri: string; text: string };

/**
 * The canonical export a symbol denotes: the module that DECLARES it and the
 * name it's exported under. `undefined` when the symbol isn't a cross-module
 * symbol (a purely-local binding, or an unresolvable import) — the caller then
 * stays single-file.
 */
type CanonicalExport = { key: string; exportedName: string };

/**
 * Resolve the symbol named `local` (used in the document at `entryKey`) to its
 * canonical export, or `undefined`. Two cases:
 *   - `local` is IMPORTED here → `(resolvedSpecifierKey, importedExportName)`.
 *   - `local` is a local binding declared+EXPORTED here → `(entryKey, local)`.
 * A purely-local (non-exported) binding has no cross-module identity → undefined
 * (the caller reports only same-file references for it).
 *
 * Synchronous: it only inspects the CURRENT file's own import/export surface
 * (`entrySource`), never a sibling, so it needs no `ModuleReader`.
 */
const canonicalExportOf = (
  local: string,
  entrySource: string,
  entryKey: string,
): CanonicalExport | undefined => {
  const { tokens } = tokenize(entrySource);
  const [program] = parseProgram(tokens, defaultScope());

  // Imported here? Find the import specifier whose LOCAL name is `local`.
  for (const imp of program.moduleImports ?? []) {
    const spec = imp.specifiers.find((s) => s.local === local);
    if (!spec) continue;
    const depKey = resolveSpecifier(imp.specifier, entryKey);
    if (depKey === undefined || depKey === entryKey) return undefined;
    return { key: depKey, exportedName: spec.name };
  }

  // Locally declared AND exported here?
  if ((program.moduleExports ?? {})[local]) {
    return { key: entryKey, exportedName: local };
  }
  return undefined;
};

/**
 * The LOCAL name that denotes the canonical export `(target.key/exportedName)`
 * inside the document at `docKey`, or `undefined` when this document neither
 * declares nor imports it. In the exporting module the local name IS the
 * exported name; in an importer it's the import specifier's `local`.
 */
const localNameForExport = (
  docKey: string,
  docSource: string,
  target: CanonicalExport,
): string | undefined => {
  if (docKey === target.key) return target.exportedName; // the declaring module
  const { tokens } = tokenize(docSource);
  const [program] = parseProgram(tokens, defaultScope());
  for (const imp of program.moduleImports ?? []) {
    const depKey = resolveSpecifier(imp.specifier, docKey);
    if (depKey !== target.key) continue;
    const spec = imp.specifiers.find((s) => s.name === target.exportedName);
    if (spec) return spec.local;
  }
  return undefined;
};

/**
 * Cross-file find-references (H0 phase 3). Given the cursor on a name in the
 * current file, return every reference to that symbol's canonical export across
 * the current file and the supplied OPEN documents (see the scope note above).
 *
 * Returns `undefined` when the symbol has no cross-module identity (a purely
 * local binding); the caller then falls back to the single-file references path.
 *
 * `name` is the identifier under the cursor; `entrySource`/`entryKey` the current
 * document; `openDocs` the other open documents (the current file may be included
 * or not — it's de-duplicated by key); `includeDeclaration` mirrors the LSP flag.
 */
export const crossFileReferences = async (
  name: string,
  entrySource: string,
  entryKey: string,
  openDocs: OpenDocument[],
  read: ModuleReader,
  includeDeclaration = true,
): Promise<CrossFileReference[] | undefined> => {
  const target = canonicalExportOf(name, entrySource, entryKey);
  if (target === undefined) return undefined;

  // The current file plus the open documents, de-duplicated by module key.
  const docsByKey = new Map<string, OpenDocument>();
  docsByKey.set(entryKey, { uri: pathToUri(entryKey), text: entrySource });
  for (const d of openDocs) {
    const key = uriToPath(d.uri);
    if (!docsByKey.has(key)) docsByKey.set(key, d);
  }

  const refs: CrossFileReference[] = [];
  for (const [docKey, doc] of docsByKey) {
    const localName = localNameForExport(docKey, doc.text, target);
    if (localName === undefined) continue;
    // Use the GRAPH-SEEDED symbol table: in an importing module a use of the
    // imported `localName` only resolves to a binding (and is recorded as an
    // occurrence) when the parse scope is seeded with the import's type — exactly
    // what `checkDocument` does. In the exporting module the binding is its real
    // local declaration; a no-import seed leaves that path unchanged.
    const { symbols } = await checkDocument(doc.text, docKey, read);
    for (const occ of symbols.occurrences) {
      if (occ.binding.name !== localName) continue;
      // In an importing module the synthesized declaration occurrence points at
      // the import statement (not a real definition); skip it when the client
      // excludes declarations, OR when it's an importer (the canonical decl lives
      // in the exporting module, reported there). In the exporting module the
      // declaration IS the real definition.
      const isImporter = docKey !== target.key;
      if (occ.isDecl && (isImporter || !includeDeclaration)) continue;
      refs.push({ uri: doc.uri, range: rangeFromCtx(occ.span) });
    }
  }
  return refs;
};
