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

import type { ModuleReader } from "../../compiler/coreTypes.ts";
import { STD_SOURCES } from "../../std/embedded.ts";
import type { VLDiagnostic, VLRange } from "../../compiler/diagnostics.ts";
import type { WasmChecker, WasmModuleSurface } from "./wasmChecker.ts";

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

// ---- std: module reads -------------------------------------------------------

/**
 * Wrap a {@link ModuleReader} so `std:` module keys resolve (docs/std-design.md
 * D3). A `std:` key is served from, first hit wins:
 *   1. the workspace's own `std/` dir when one is known (`getStdDir`) — read
 *      through the INNER reader so open-buffer edits to std sources win over
 *      disk, and a workspace WITHOUT the file falls through; this is what lets
 *      dogfooding in this repo see `std/` edits live, ahead of the embedded
 *      map bundled with the extension;
 *   2. the GENERATED embedded map (`std/embedded.ts`, `deno task gen-std`) —
 *      the no-filesystem path the bundled LSP and the playground rely on.
 * Every other key passes through unchanged. Used by BOTH LSP checkers: the TS
 * moduleGraph (via {@link makeWorkspaceReader}) and the wasm checker's fetch
 * loop (`wasmChecker.ts`), so the editor agrees with the CLI about std.
 *
 * `getStdDir` is a thunk because the workspace root is only known after
 * `onInitialize`, while readers are constructed at module load.
 */
export const withStd = (
  read: ModuleReader,
  getStdDir?: () => string | undefined,
): ModuleReader =>
async (key: string): Promise<string | undefined> => {
  if (!key.startsWith("std:")) return read(key);
  const name = key.slice("std:".length);
  const stdDir = getStdDir?.();
  if (stdDir !== undefined) {
    const fromWorkspace = await read(`${stdDir}/${name}.vl`);
    if (fromWorkspace !== undefined) return fromWorkspace;
  }
  return STD_SOURCES[key];
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
 * specifiers resolved from a path-shaped `fromKey`) or `std:` module keys,
 * served via {@link withStd} (workspace `std/` dir when `getStdDir` yields one,
 * else the embedded map). Open buffers are keyed by `file://` URI, so the
 * reader converts the path key back to a URI to consult them.
 */
export const makeWorkspaceReader = (
  documents: OpenDocuments,
  readDisk: (path: string) => string | undefined = defaultReadDisk,
  getStdDir?: () => string | undefined,
): ModuleReader =>
  withStd((key: string): string | undefined => {
    // 1. Open buffer (unsaved edits win over disk).
    const open = documents.get(pathToUri(key));
    if (open) return open.getText();
    // 2. Disk fallback.
    return readDisk(key);
  }, getStdDir);

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

// ---- cross-file source location ---------------------------------------------
//
// The resolved location of an imported name's declaration in its exporting
// sibling — produced by the self-hosted checker's import/export pass
// (`wasmChecker.importedNameSources`, shaped onto this by `server.ts`'s
// `toCrossFileSource`) and consumed by cross-file go-to-definition + the
// canonical-export resolver below.

/** A resolved cross-file source location: the exporting module + decl range. */
export type CrossFileSource = {
  /** The exporting module's filesystem key (what `resolveSpecifier` produced). */
  key: string;
  /** The exporting module's `file://` URI (for an LSP `Location` / xref link). */
  uri: string;
  /** The export declaration's range, in 0-based LSP coordinates. */
  range: VLRange;
};

// ---- workspace .vl file enumeration ----------------------------------------
//
// Supports the on-disk sibling crawl in `crossFileReferences`.
//
// Cap: at most MAX_DISK_FILES `.vl` files are read per request. This bounds
// memory and parse time for very large repos while still covering all realistic
// VL projects. The cap is documented in ROADMAP (cross-file refs / H0 phase 3).
//
// Excluded dirs (never descended): `.git`, `node_modules`, `dist`, `.claude`,
// `reference`. These directories are always irrelevant to VL source search and
// can be large or contain generated code.
//
// Project-root detection: the LSP server passes its workspace root when
// available (the `rootUri` from `onInitialize`). When the caller passes no root,
// `detectProjectRoot` walks UP from `fromPath` (the key of the symbol's defining
// module) looking for the nearest ancestor that contains `deno.json`,
// `package.json`, or `.git`; it stops after at most ROOT_WALK_LIMIT levels to
// avoid climbing out of the project in monorepo structures. Falls back to the
// immediate parent directory of `fromPath` if no sentinel is found.

/** Maximum `.vl` files read in a single on-disk crawl (cost bound). */
export const MAX_DISK_FILES = 500;

/** Dirs never descended during the workspace crawl. */
const SKIP_DIRS = new Set([".git", "node_modules", "dist", ".claude", "reference"]);

/**
 * The sentinel file names whose presence in a directory marks it as a project
 * root during the upward walk in {@link detectProjectRoot}.
 */
const ROOT_SENTINELS = ["deno.json", "package.json", ".git"];

/** Maximum number of directory levels to walk up when detecting the project root. */
const ROOT_WALK_LIMIT = 6;

/**
 * Walk up from the directory containing `fromPath` until a directory that
 * contains one of the {@link ROOT_SENTINELS} is found, or {@link ROOT_WALK_LIMIT}
 * levels are exhausted. Returns that directory's path (no trailing slash).
 *
 * `listDir` is injectable so tests can supply a synthetic directory listing
 * without touching the real filesystem.
 */
export const detectProjectRoot = (
  fromPath: string,
  listDir: (dir: string) => string[] = defaultListDir,
): string => {
  // Start from the directory containing `fromPath`.
  let dir = fromPath.includes("/") ? fromPath.slice(0, fromPath.lastIndexOf("/")) : fromPath;
  for (let i = 0; i < ROOT_WALK_LIMIT; i++) {
    const entries = listDir(dir);
    if (ROOT_SENTINELS.some((s) => entries.includes(s))) return dir;
    // Walk up one level.
    const parent = dir.includes("/") ? dir.slice(0, dir.lastIndexOf("/")) : dir;
    if (parent === dir) break; // filesystem root — stop
    dir = parent;
  }
  // No sentinel found: use the immediate parent of `fromPath`.
  return fromPath.includes("/") ? fromPath.slice(0, fromPath.lastIndexOf("/")) : fromPath;
};

/**
 * Enumerate all `.vl` files under `root` (recursive), skipping
 * {@link SKIP_DIRS}, and returning at most {@link MAX_DISK_FILES} paths.
 *
 * `listDir` and `isDir` are injectable so tests can avoid touching the real
 * filesystem. Both default to the `node:fs`-based implementations used in
 * production.
 */
export const enumerateWorkspaceFiles = (
  root: string,
  listDir: (dir: string) => string[] = defaultListDir,
  isDir: (path: string) => boolean = defaultIsDir,
): string[] => {
  const results: string[] = [];
  const stack: string[] = [root];
  while (stack.length > 0 && results.length < MAX_DISK_FILES) {
    const dir = stack.pop()!;
    let entries: string[];
    try {
      entries = listDir(dir);
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (results.length >= MAX_DISK_FILES) break;
      const fullPath = `${dir}/${entry}`;
      if (isDir(fullPath)) {
        if (!SKIP_DIRS.has(entry)) stack.push(fullPath);
      } else if (entry.endsWith(".vl")) {
        results.push(fullPath);
      }
    }
  }
  return results;
};

// Node:fs helpers for directory listing and stat, loaded lazily via the same
// `createRequire`-based `require` that `defaultReadDisk` uses (see above).
type FsModuleExt = FsModule & {
  readdirSync(path: string): string[];
  statSync(path: string): { isDirectory(): boolean };
};
let fsModuleExt: FsModuleExt | undefined;
const loadFsExt = (): FsModuleExt | undefined => {
  if (fsModuleExt) return fsModuleExt;
  if (typeof require !== "function") return undefined;
  try {
    const spec = "node:" + "fs";
    fsModuleExt = require(spec) as FsModuleExt;
    return fsModuleExt;
  } catch {
    return undefined;
  }
};

const defaultListDir = (dir: string): string[] => {
  try {
    const fs = loadFsExt();
    return fs ? fs.readdirSync(dir) : [];
  } catch {
    return [];
  }
};

const defaultIsDir = (path: string): boolean => {
  try {
    const fs = loadFsExt();
    return fs ? fs.statSync(path).isDirectory() : false;
  } catch {
    return false;
  }
};

// ---- cross-file find-references --------------------------------------------
//
// Scope: references to a symbol are searched in the CURRENT file, every OTHER
// OPEN document, AND every `.vl` file reachable from the project root that is
// NOT already in the open-documents set (the on-disk sibling crawl).
//
// The crawl is bounded:
//   • Root detection: use the LSP workspace-folder root when available; otherwise
//     walk up from the symbol's defining-module path to the nearest ancestor that
//     contains `deno.json`, `package.json`, or `.git` (at most ROOT_WALK_LIMIT
//     levels); falls back to the immediate parent directory.
//   • File cap: at most MAX_DISK_FILES `.vl` files are read per request.
//   • Excluded dirs: `.git`, `node_modules`, `dist`, `.claude`, `reference`.
//   • The crawl is only triggered when the symbol has cross-module identity
//     (same gate as the open-docs path) — purely-local symbols short-circuit
//     before any disk I/O.
//   • Open-document text takes priority over disk (unsaved edits win); on-disk
//     results are deduplicated against already-found open-doc refs by URI.
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
 * The canonical export a symbol denotes: the module that DECLARES it, the name
 * it's exported under, and the 1-based line / 0-based col of that export's
 * declaring name (the `target` shape `WasmChecker.referencesInEntry` consumes).
 * `undefined` when the symbol isn't a cross-module symbol (a purely-local
 * binding, or an unresolvable import) — the caller then stays single-file.
 */
type CanonicalExport = {
  key: string;
  exportedName: string;
  declLine: number; // 1-based native line of the decl name
  declCol: number; // 0-based column of the decl name
};

/**
 * Resolve the symbol named `name` (used in the document at `entryKey`) to its
 * canonical export, off the SELF-HOSTED checker, or `undefined`. Two cases:
 *   - `name` is IMPORTED here → the sibling's `(key, exportedName, decl pos)`,
 *     recovered directly from `importedNameSources` (which now carries the
 *     exported name + the sibling's decl-name position).
 *   - `name` is a local binding declared+EXPORTED here → `(entryKey, name, decl
 *     pos)` from the entry's own `moduleSurface` export entry.
 * A purely-local (non-exported) binding has no cross-module identity → undefined
 * (the caller reports only same-file references for it).
 *
 * Async because the imported case reads the entry's import sources through the
 * wasm checker (which commits the sibling graph via the workspace reader).
 */
const canonicalExportOf = async (
  name: string,
  entrySource: string,
  entryKey: string,
  read: ModuleReader,
  wasmChecker: WasmChecker,
): Promise<CanonicalExport | undefined> => {
  // Imported here? `importedNameSources` keys by the LOCAL alias and carries the
  // sibling key, the EXPORTED name, and the export's decl-name position.
  const sources = await wasmChecker.importedNameSources(entrySource, entryKey, read);
  const src = sources[name];
  if (src !== undefined) {
    return {
      key: src.key,
      exportedName: src.exportedName,
      declLine: src.line,
      declCol: src.col,
    };
  }

  // Locally declared AND exported here? The entry's own surface lists its
  // exports with their decl-name positions.
  const surface = wasmChecker.moduleSurface(entrySource, entryKey);
  const exp = surface.exports.find((e) => e.name === name);
  if (exp !== undefined) {
    return {
      key: entryKey,
      exportedName: exp.name,
      declLine: exp.declLine,
      declCol: exp.declCol,
    };
  }
  return undefined;
};

/**
 * Cross-file find-references (H0 phase 3, extended). Given the cursor on a name
 * in the current file, return every reference to that symbol's canonical export
 * across:
 *   1. The current file.
 *   2. Every other OPEN document (`openDocs`).
 *   3. Every `.vl` file discovered by the on-disk sibling crawl (`diskFiles`)
 *      that is NOT already covered by the open-documents set.
 *
 * Returns `undefined` when the symbol has no cross-module identity (a purely
 * local binding); the caller then falls back to the single-file references path.
 *
 * `name` is the identifier under the cursor; `entrySource`/`entryKey` the current
 * document; `openDocs` the other open documents (the current file may be included
 * or not — it's de-duplicated by key); `diskFiles` is the pre-enumerated list of
 * on-disk `.vl` paths (from {@link enumerateWorkspaceFiles} or an injected list in
 * tests — empty for single-file / no-crawl callers); `includeDeclaration` mirrors
 * the LSP flag.
 *
 * De-duplication: a file that appears in BOTH `openDocs` and `diskFiles` is
 * searched exactly once (the open-buffer text wins, so the user's unsaved edits
 * are seen). Locations are not duplicated.
 */
export const crossFileReferences = async (
  name: string,
  entrySource: string,
  entryKey: string,
  openDocs: OpenDocument[],
  read: ModuleReader,
  wasmChecker: WasmChecker,
  includeDeclaration = true,
  diskFiles: string[] = [],
): Promise<CrossFileReference[] | undefined> => {
  const target = await canonicalExportOf(
    name,
    entrySource,
    entryKey,
    read,
    wasmChecker,
  );
  if (target === undefined) return undefined;

  // The current file plus the open documents, de-duplicated by module key.
  const docsByKey = new Map<string, OpenDocument>();
  docsByKey.set(entryKey, { uri: pathToUri(entryKey), text: entrySource });
  for (const d of openDocs) {
    const key = uriToPath(d.uri);
    if (!docsByKey.has(key)) docsByKey.set(key, d);
  }

  // Add on-disk files that are NOT already in the open-documents set.
  // The workspace reader (`read`) is used to fetch their text — it will return
  // the open-buffer text if the file happens to be open (consistent view), or
  // fall back to disk. We only skip keys already in `docsByKey` to avoid
  // double-counting a file that is both listed in `diskFiles` and in `openDocs`.
  for (const diskPath of diskFiles) {
    if (docsByKey.has(diskPath)) continue; // already covered by an open buffer
    const text = await read(diskPath);
    if (text === undefined) continue; // unreadable — skip
    docsByKey.set(diskPath, { uri: pathToUri(diskPath), text });
  }

  const refs: CrossFileReference[] = [];
  for (const [docKey, doc] of docsByKey) {
    // Compile each candidate as its OWN entry off the self-hosted checker: an
    // entry's committed graph only spans modules it imports, so a reference that
    // lives in another importer surfaces only in that importer's own compile —
    // which is exactly why we drive one compile per candidate file and union the
    // per-candidate (module 0) occurrences here.
    const occs = await wasmChecker.referencesInEntry(doc.text, docKey, read, target);
    for (const occ of occs) {
      // An importer has no synthesized declaration occurrence (imports are
      // parser-skipped), so a decl only appears in the declaring module; drop it
      // when the client excludes declarations.
      if (occ.isDecl && !includeDeclaration) continue;
      refs.push({ uri: doc.uri, range: occ.range });
    }
  }
  return refs;
};

// ---- project-wide unused-export hints ---------------------------------------
//
// A debounced workspace pass (triggered on document save, NOT per-keystroke)
// builds a global USE-MAP in one crawl: enumerate every .vl file under the
// project root, parse each, and record every REFERENCE to every exported symbol
// `(exportingModuleKey, exportedName)`.
//
// For each exported symbol in the document being checked: if it has ZERO
// references anywhere in the project (local uses + cross-module uses), emit a
// `hint`-severity diagnostic tagged `unnecessary` on the export's name — VS Code
// will grey/fade it without a squiggle.
//
// Design decisions:
//   • "Used locally but not imported" = NOT unused. An export that the exporting
//     module itself references (e.g. a recursive function, or a value used in the
//     same file) is not dead code — only flag exports with zero references
//     ANYWHERE (local + cross-module). The goal is "never imported or used", not
//     "never imported".
//   • Struct FIELDS are out of scope. VL's structural typing makes field-level
//     usage analysis fuzzy (a type `{x: i32}` matches ANY struct with an `x`
//     field, so a field could be "used" via a widened receiver without an explicit
//     import). Field-level unused hints are deferred.
//   • Exports are already exempt from the normal unused-variable lint (`b.exported`
//     check in `lint.ts`). These hints are purely additive and do not double-warn.
//   • The 500-file cap (`MAX_DISK_FILES`) is reused from `crossFileReferences`.

/**
 * Reference counts for a single exported symbol, split by origin:
 *   `cross` — how many OTHER modules import this symbol (cross-module count).
 *   `local` — how many non-declaration occurrences appear within the exporting
 *              module itself (same-file local uses, e.g. a recursive call).
 *
 * Decision matrix in `unusedExportHints`:
 *   cross == 0 && local == 0  → fully dead   → grey the export NAME (existing hint)
 *   cross == 0 && local  > 0  → redundant    → grey the `export` KEYWORD (new hint)
 *   cross  > 0               → real export  → no hint
 */
export type ExportRefCounts = { cross: number; local: number };

/**
 * The use-map produced by a single project-wide pass: for each
 * `(exportingModuleKey, exportedName)` pair, the split reference counts
 * (`cross` = cross-module imports, `local` = same-file uses).
 * Both counts zero means the export is never referenced anywhere.
 */
export type UnusedExportUseMap = Map<string, Map<string, ExportRefCounts>>;

/**
 * Build a project-wide use-map in ONE pass over every `.vl` file in `allFiles`.
 *
 * Two kinds of references are counted:
 *
 * 1. CROSS-MODULE: Any `import { name } from "./sibling"` statement is a
 *    reference to `sibling.vl`'s `name` export. We do NOT require that the
 *    importer actually USES the name after importing it (if it doesn't, the
 *    existing `unused-import` lint flags the importer). Counting the import
 *    statement itself avoids needing graph-seeded parsing just to resolve uses of
 *    imported bindings (which `parseSymbols` alone can't do — an unresolved
 *    import binding has no symbol-table occurrences in the single-file parse).
 *
 * 2. SAME-FILE: An exported binding that the exporting module itself references
 *    (e.g. a recursive function, or a `const` exported AND used in the same file)
 *    is NOT dead — the symbol table non-decl occurrences of that binding name
 *    in the same file count as local uses (no seeding needed; the binding is
 *    declared locally and resolves fine in a single-file parse).
 *
 * `read` is the workspace reader (open buffers + disk). `allFiles` is the
 * pre-enumerated list of `.vl` paths to scan (from `enumerateWorkspaceFiles`).
 */
export const buildUnusedExportUseMap = async (
  allFiles: string[],
  read: ModuleReader,
  wasmChecker: WasmChecker,
): Promise<UnusedExportUseMap> => {
  const useMap: UnusedExportUseMap = new Map();

  // Ensure a (moduleKey, exportName) entry exists (both counts at 0).
  const ensureEntry = (moduleKey: string, exportName: string): void => {
    let inner = useMap.get(moduleKey);
    if (inner === undefined) {
      inner = new Map();
      useMap.set(moduleKey, inner);
    }
    if (!inner.has(exportName)) inner.set(exportName, { cross: 0, local: 0 });
  };

  // Increment the cross-module import count for a (moduleKey, exportName) pair.
  const addCrossRef = (moduleKey: string, exportName: string): void => {
    const inner = useMap.get(moduleKey);
    if (inner === undefined) return; // exporter not yet seeded
    const counts = inner.get(exportName);
    if (counts === undefined) return;
    inner.set(exportName, { cross: counts.cross + 1, local: counts.local });
  };

  // Increment the same-file local use count for a (moduleKey, exportName) pair.
  const addLocalRef = (moduleKey: string, exportName: string): void => {
    const inner = useMap.get(moduleKey);
    if (inner === undefined) return; // exporter not yet seeded
    const counts = inner.get(exportName);
    if (counts === undefined) return;
    inner.set(exportName, { cross: counts.cross, local: counts.local + 1 });
  };

  // Read all sources up front (one async pass over the file list), and resolve
  // each file's import/export surface off the self-hosted checker. A file the
  // reader can't serve is skipped.
  const sources = new Map<string, string>();
  const surfaces = new Map<string, WasmModuleSurface>();
  for (const filePath of allFiles) {
    const src = await read(filePath);
    if (src === undefined) continue;
    sources.set(filePath, src);
    surfaces.set(filePath, wasmChecker.moduleSurface(src, filePath));
  }

  // ── PASS 1: seed the use-map with every export declaration (counts {0,0}). ─
  for (const [filePath, surface] of surfaces) {
    for (const exp of surface.exports) ensureEntry(filePath, exp.name);
  }

  // ── PASS 2a: cross-module refs via resolved imports. ───────────────────────
  // Each resolved `import { name } from "./sibling"` is a reference to
  // `sibling.vl`'s `name` export, regardless of whether the local binding is
  // later used (unused-import lint handles "imported but never used"). The
  // surface already carries the resolved sibling key + exported source name.
  for (const surface of surfaces.values()) {
    for (const imp of surface.imports) addCrossRef(imp.key, imp.name);
  }

  // ── PASS 2b: same-file refs via the checker's reference set. ───────────────
  // An exported binding used WITHIN the same file (e.g. a recursive exported
  // function, or a value the file also consumes) is not dead. Find-references on
  // the export's decl name yields the declaration plus every use; the local-use
  // count is the reference total minus the declaration occurrence itself.
  for (const [filePath, surface] of surfaces) {
    const source = sources.get(filePath)!;
    for (const exp of surface.exports) {
      const refs = await wasmChecker.referencesAt(
        source,
        filePath,
        read,
        exp.declLine - 1, // native 1-based line → 0-based LSP line
        exp.declCol,
        true,
      );
      const localUses = Math.max(0, refs.length - 1);
      for (let n = 0; n < localUses; n++) addLocalRef(filePath, exp.name);
    }
  }

  return useMap;
};

/**
 * Produce hint diagnostics for every exported symbol in `entrySource` (at
 * `entryKey`) whose reference counts indicate it is dead or redundant, per
 * `useMap`.
 *
 * Two distinct hint kinds:
 *
 * 1. **Fully dead** (`cross == 0 && local == 0`): the export is never
 *    referenced anywhere — not imported by any other module, and not used
 *    within the exporting file itself. Hints on the export **NAME**.
 *    Code: `unused-export`. Message: "Exported `foo` is never used in the project".
 *
 * 2. **Redundant export** (`cross == 0 && local > 0`): the symbol IS used
 *    within its own module (e.g. a recursive function, or a value also consumed
 *    locally) but no other module ever imports it — so the `export` modifier
 *    is superfluous. Hints on the **`export` keyword** token.
 *    Code: `redundant-export`. Message: "`export` is redundant — `foo` is only
 *    used within this module, never imported".
 *
 * 3. **Real export** (`cross > 0`): used by at least one other module — no hint.
 *
 * Severity: `hint` (no squiggle). Tag: `unnecessary` (VS Code greys the span).
 * Source: `"vital"`.
 *
 * Struct fields are NOT checked here (structural typing makes field-level
 * usage analysis too fuzzy — see module-level comment). Only function and value
 * exports are flagged.
 *
 * These hints are designed to be MERGED with the file's regular diagnostics
 * (e.g. lint/type diagnostics from `checkDocument`); they do not replace them.
 */
export const unusedExportHints = (
  entrySource: string,
  entryKey: string,
  useMap: UnusedExportUseMap,
  wasmChecker: WasmChecker,
): VLDiagnostic[] => {
  const hints: VLDiagnostic[] = [];
  const fileExports = useMap.get(entryKey);
  if (fileExports === undefined || fileExports.size === 0) return hints;

  // Build a map from exported name → { nameRange, exportKwRange } off the
  // self-hosted checker's surface. Native spans are 1-based line / 0-based col;
  // the LSP range is 0-based line / 0-based char. The decl-name range spans the
  // name; the keyword range spans the literal `export` (6 chars).
  const declRanges = new Map<string, VLRange>();
  const exportKwRanges = new Map<string, VLRange>();
  const surface = wasmChecker.moduleSurface(entrySource, entryKey);
  for (const exp of surface.exports) {
    if (declRanges.has(exp.name)) continue; // first decl wins
    const nameLine = exp.declLine > 0 ? exp.declLine - 1 : 0;
    declRanges.set(exp.name, {
      start: { line: nameLine, character: exp.declCol },
      end: { line: nameLine, character: exp.declCol + exp.name.length },
    });
    const kwLine = exp.kwLine > 0 ? exp.kwLine - 1 : 0;
    exportKwRanges.set(exp.name, {
      start: { line: kwLine, character: exp.kwCol },
      end: { line: kwLine, character: exp.kwCol + "export".length },
    });
  }

  for (const [exportName, counts] of fileExports) {
    const { cross, local } = counts;

    if (cross > 0) continue; // real export — used by another module, no hint

    if (local === 0) {
      // ── Fully dead: not imported, not locally used → grey the NAME. ─────────
      const range = declRanges.get(exportName);
      if (range === undefined) continue; // shouldn't happen; defensive
      hints.push({
        message: `Exported \`${exportName}\` is never used in the project`,
        severity: "hint",
        range,
        code: "unused-export",
        source: "vital",
        tags: ["unnecessary"],
      });
    } else {
      // ── Redundant export: locally used but never imported → grey the KEYWORD.
      const kwRange = exportKwRanges.get(exportName);
      if (kwRange === undefined) continue; // no keyword span captured; skip
      hints.push({
        message:
          `\`export\` is redundant — \`${exportName}\` is only used within this module, never imported`,
        severity: "hint",
        range: kwRange,
        code: "redundant-export",
        source: "vital",
        tags: ["unnecessary"],
      });
    }
  }

  return hints;
};
