// Multi-file driver for the VL module system (phase 1).
//
// VL has no module system at the type/codegen core: `compile(source)` tokenizes
// ONE string, parses it against ONE `defaultScope()`, and emits ONE wasm module.
// This file adds the *front end* that turns an entry `.vl` file plus its
// `import`ed dependencies into a SINGLE merged program the existing back end
// compiles unchanged — exactly the whole-program → one-wasm-module model the
// modules design (docs/modules-design.md §2.3) settles on. The back end
// (`toWasm`) is untouched: it receives one `VLProgramNode` and emits one binary.
//
// Pipeline (per docs/modules-design.md §2.6):
//   1. RESOLVE the import graph from the entry file, reading + parsing each
//      reachable module exactly once, with a clean error on import cycles.
//   2. PARSE each module dependency-first against `defaultScope()` augmented with
//      its imports' *types* (so cross-module references type-check), and validate
//      every import resolves to an actually-`export`ed name.
//   3. MERGE the modules into one `VLProgramNode` with PER-MODULE NAME ISOLATION:
//      every module's top-level value names (functions + top-level `let`/`const`)
//      are mangled to a whole-program-unique form, and references are rewritten so
//      two modules each declaring `advance` (the self-host gap) no longer collide
//      and an `import { x }` binds to the *exporting* module's (mangled) `x`.
//   4. EMIT one wasm module from the merged program (the caller runs codegen).
//
// Phase-1 scope (DEFERRED to later phases, see the design doc):
//   - the `std:` scheme + embedded std bundle (phase 2); this driver only
//     resolves RELATIVE specifiers (`./`, `../`) against the importing file's
//     directory, appending `.vl`.
//   - import maps, namespace imports, default exports, export-all, re-exports.
//   - cross-module `let` initialization-order beyond import (dependency-first)
//     topological order — see the design doc's open sub-question.
//
// Runtime-agnostic: like `compile.ts`, this module takes an injected file reader
// rather than touching `Deno`/`process`, so it stays bundleable into the LSP. The
// CLI passes a filesystem reader; tests pass an in-memory map.

import type {
  NodeSpans,
  VLImportNode,
  VLModuleExport,
  VLProgramNode,
  VLStatement,
  VLType,
} from "./ast.ts";
import type { VLDiagnostic } from "./compile.ts";
import { rangeFromCtx } from "./compile.ts";
import { tokenize } from "./lexer.ts";
import { parseProgram } from "./parser.ts";
import { defaultScope } from "./defaultScope.ts";
import { SymbolTable } from "./symbols.ts";
import { rewriteNames } from "./moduleRewrite.ts";

// `ModuleKey` + `ModuleReader` live in the dependency-free leaf `coreTypes.ts`
// (shared with the LSP/playground); re-exported here so the compiler's internal
// imports are unchanged.
import type { ModuleKey, ModuleReader } from "./coreTypes.ts";
export type { ModuleKey, ModuleReader };

/** One parsed module plus its resolved key and per-module rename map. */
type LoadedModule = {
  key: ModuleKey;
  program: VLProgramNode;
  diagnostics: VLDiagnostic[];
  /** Local top-level value/type name → whole-program-unique codegen name. */
  rename: Map<string, string>;
  /** Local names introduced by `import` (excluded from this module's own scope). */
  importedLocals: Set<string>;
  /** This module's per-document symbol table (concatenated into the result). */
  symbols: SymbolTable;
};

/**
 * One ENTRY-module `export function` that becomes a host-callable wasm export.
 * `exportName` is the original (un-mangled) export name the host calls by;
 * `internalName` is the entry module's whole-program-mangled codegen name (what
 * the merged AST / `toWasm` actually emit the function under). Only the entry
 * module contributes these — imported modules' exports stay intra-program
 * linkage (still tree-shakeable). See `loadProgram`.
 */
export type HostExport = { exportName: string; internalName: string };

/** Result of the multi-file front end (mirrors the single-file shape we merge into). */
export type ProgramResult = {
  /** The merged whole-program AST, or `undefined` if the entry could not load. */
  ast: VLProgramNode | undefined;
  diagnostics: VLDiagnostic[];
  /** Combined symbol table (per-module tables concatenated). */
  symbols: SymbolTable;
  /**
   * The ENTRY module's `export function`s, to be emitted as host-callable wasm
   * exports (binaryen treats an export as a DCE root, so this both keeps the
   * function and exposes it). Empty when the entry has no exported functions —
   * in which case codegen behaves exactly as the legacy start/script model. Only
   * functions are exported in v1 (exported `let`/`const` globals are deferred).
   */
  hostExports: HostExport[];
};

// --- specifier resolution --------------------------------------------------

/** True for a relative specifier (`./x`, `../x`) — the only kind phase 1 loads. */
const isRelative = (spec: string): boolean =>
  spec.startsWith("./") || spec.startsWith("../");

/**
 * A `std:` specifier: `std:` + a `[a-z0-9_]+(/[a-z0-9_]+)*` module name. The
 * specifier IS the module key — it resolves verbatim, never to a
 * filesystem-shaped path; the READER layer owns the mapping to bytes (the CLI
 * reads the repo `std/` dir, the Rust host `$VL_STD`/the exe-relative `std/`,
 * the LSP the embedded map). Keeps std keys unspoofable by user paths.
 */
const STD_SPEC = /^std:[a-z0-9_]+(\/[a-z0-9_]+)*$/;
const isStdSpec = (spec: string): boolean => STD_SPEC.test(spec);

/** True for a module key in the `std:` scheme (a verbatim std specifier). */
export const isStdKey = (key: ModuleKey): boolean => key.startsWith("std:");

/** The directory portion of a `/`-separated module key (no trailing slash). */
const dirOf = (key: ModuleKey): string => {
  const slash = key.lastIndexOf("/");
  return slash === -1 ? "" : key.slice(0, slash);
};

/**
 * Normalize a `/`-separated path, collapsing `.` and `..` segments. Pure string
 * math (no `Deno`/`node:path`) so the driver stays runtime-agnostic. Leading
 * `..` segments that escape the root are kept (they make the key distinct and
 * the reader simply won't find them — surfaced as an unresolvable-path error).
 */
const normalize = (path: string): string => {
  // Preserve an absolute leading `/` (filesystem keys) — collapsing it would turn
  // `/home/x/util.vl` into a relative `home/x/util.vl` the reader can't find.
  const absolute = path.startsWith("/");
  const out: string[] = [];
  for (const seg of path.split("/")) {
    if (seg === "" || seg === ".") continue;
    if (seg === "..") {
      if (out.length > 0 && out[out.length - 1] !== "..") out.pop();
      else out.push("..");
    } else out.push(seg);
  }
  return (absolute ? "/" : "") + out.join("/");
};

/**
 * Resolve an import `specifier` written in the module at `fromKey` to a module
 * key, or `undefined` when it is a kind the resolver cannot resolve (a bare
 * specifier, a malformed `std:` name, or a RELATIVE specifier inside a std
 * module — std-internal imports use `std:` specifiers only, because
 * `dirOf("std:fmt")` is `""` so `./x` would resolve CWD-relative, a confusion
 * magnet). A well-formed `std:` specifier IS its key (returned verbatim). A
 * relative specifier resolves against the importing file's directory; the `.vl`
 * extension is APPENDED (specifiers omit it) per the design's "append `.vl`,
 * no index/directory guessing" rule.
 */
export const resolveSpecifier = (
  specifier: string,
  fromKey: ModuleKey,
): ModuleKey | undefined => {
  if (isStdSpec(specifier)) return specifier; // the specifier IS the key
  if (!isRelative(specifier)) return undefined; // bare/malformed-std
  if (isStdKey(fromKey)) return undefined; // std-internal relative — rejected
  const base = dirOf(fromKey);
  const joined = base === "" ? specifier : `${base}/${specifier}`;
  return `${normalize(joined)}.vl`;
};

// --- diagnostics helpers ---------------------------------------------------

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
      // No span (shouldn't happen for a parsed import) — point at file start.
      : { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } },
  };
};

// --- graph load + merge ----------------------------------------------------

/**
 * Build the whole-program AST from `entryKey`, reading every reachable module via
 * `read`, type-checking each against its imports, validating imports, and merging
 * everything into a single `VLProgramNode` with per-module name isolation.
 *
 * Cycle handling: import cycles among *modules* are detected during the
 * dependency-first load (a clean diagnostic, never an infinite loop). Phase 1
 * loads each module once; a back-edge to a module currently being loaded is a
 * cycle error (cross-module value-init cycles are out of scope — design open Q).
 */
export const loadProgram = async (
  entryKey: ModuleKey,
  read: ModuleReader,
): Promise<ProgramResult> => {
  const diagnostics: VLDiagnostic[] = [];
  // Resolved key → loaded module (dedupe; parse each module exactly once).
  const loaded = new Map<ModuleKey, LoadedModule>();
  // Keys currently on the load stack — a re-entry is an import cycle.
  const loading = new Set<ModuleKey>();
  // The ENTRY module's `export function`s, captured at merge time. Only the entry
  // (module index 0) contributes host exports; imported modules' `export`s stay
  // intra-program linkage. `exported` on a decl ALONE can't tell entry from
  // non-entry (every exported decl keeps `exported: true` after merge), so we
  // record the entry's exports explicitly here rather than re-deriving later.
  const hostExports: HostExport[] = [];
  // Monotonic module index → the mangling suffix (`$m0`, `$m1`, …). The entry is
  // index 0; the index is purely for unique, debuggable names.
  let moduleIndex = 0;

  /**
   * Load (parse + recurse into imports) the module at `key`. Dependency-first:
   * a module's imports are fully loaded before it is parsed, so its
   * `initialScope` can be seeded with the imported names' resolved types.
   * Returns the loaded module, or `undefined` when the source can't be read or a
   * cycle is detected (the diagnostic is already pushed).
   */
  const load = async (
    key: ModuleKey,
    // Span + node to attribute a load failure to (the importing site), if any.
    blame?: { node: VLImportNode; spans: NodeSpans },
  ): Promise<LoadedModule | undefined> => {
    const existing = loaded.get(key);
    if (existing) return existing;
    if (loading.has(key)) {
      // A back-edge to a module still being loaded: an import cycle. Report it
      // against the importing statement and stop — never recurse into it again.
      if (blame) {
        diagnostics.push(importError(
          blame.node,
          blame.spans,
          `Import cycle detected through "${blame.node.specifier}" (module \`${key}\`)`,
        ));
      }
      return undefined;
    }

    const source = await read(key);
    if (source === undefined) {
      if (blame) {
        diagnostics.push(importError(
          blame.node,
          blame.spans,
          `Cannot resolve import "${blame.node.specifier}" (no module \`${key}\`)`,
        ));
      }
      return undefined;
    }

    loading.add(key);
    const myIndex = moduleIndex++;

    // First pass: parse the module's imports against a bare default scope just to
    // discover its import graph (so we can load dependencies before the real
    // parse seeds their types). The parse is cheap and side-effect-free here.
    const probeTokens = tokenize(source);
    const [probe, , , probeSpans] = parseProgram(
      probeTokens.tokens,
      defaultScope(),
    );

    // Load every imported module first (dependency-first), resolving specifiers
    // against THIS module's key. A resolved dependency contributes its exports'
    // types to the importer's initial scope.
    const depByLocal = new Map<
      string,
      { exp: VLModuleExport; dep: LoadedModule }
    >();
    for (const imp of probe.moduleImports ?? []) {
      const depKey = resolveSpecifier(imp.specifier, key);
      if (depKey === undefined) {
        // Texts mirror the native driver's `modVisit` — keep them aligned.
        diagnostics.push(importError(
          imp,
          probeSpans,
          isStdKey(key) && isRelative(imp.specifier)
            ? `Unsupported import specifier "${imp.specifier}" — std modules ` +
              `import only via \`std:\` specifiers (relative imports inside ` +
              `std are not allowed)`
            : `Unsupported import specifier "${imp.specifier}" — supported: ` +
              `relative paths (\`./\`, \`../\`) and \`std:\` modules; bare ` +
              `specifiers are not yet implemented`,
        ));
        continue;
      }
      const dep = await load(depKey, { node: imp, spans: probeSpans });
      if (!dep) continue;
      const exports = dep.program.moduleExports ?? {};
      for (const spec of imp.specifiers) {
        const exp = exports[spec.name];
        if (!exp) {
          diagnostics.push(importError(
            imp,
            probeSpans,
            `"${spec.name}" is not exported by "${imp.specifier}"`,
          ));
          continue;
        }
        depByLocal.set(spec.local, { exp, dep });
      }
    }

    // Real parse: seed the initial scope with the imported names' resolved types
    // (bound under their LOCAL name) so references type-check exactly as if the
    // names were declared locally (design §2.1 "imports bind as if local").
    const initialScope = defaultScope();
    for (const [local, { exp }] of depByLocal) {
      initialScope[local] = exp.type;
    }
    const tokens = tokenize(source);
    const [program, errors, symbols, spans] = parseProgram(
      tokens.tokens,
      initialScope,
    );

    // Surface lexer + parser diagnostics for this module.
    for (const d of tokens.diagnostics) diagnostics.push(d);
    for (const e of errors) diagnostics.push(parseErrorToDiagnostic(e, spans));

    // Build this module's rename map: every top-level value/type name → a
    // whole-program-unique mangled name. Imports map their LOCAL name to the
    // exporting module's mangled name for the EXPORTED name (so the reference
    // points at the real target). The entry module (index 0) could keep its
    // names, but mangling every module uniformly keeps the rule simple and the
    // output debuggable.
    const rename = new Map<string, string>();
    const importedLocals = new Set(depByLocal.keys());
    const topNames = collectTopLevelNames(program, importedLocals);
    for (const name of topNames) rename.set(name, `${name}$m${myIndex}`);
    // Imported locals override: bind to the dependency's mangled export name.
    for (const [local, { exp, dep }] of depByLocal) {
      const target = dep.rename.get(exp.name) ?? exp.name;
      rename.set(local, target);
    }
    // Record each export's mangled codegen name so importers can target it.
    for (const exp of Object.values(program.moduleExports ?? {})) {
      exp.mangledName = rename.get(exp.name) ?? exp.name;
    }

    // Entry-only host exports: the ENTRY module (index 0) is the only one whose
    // `export function`s become host-callable wasm exports. Imported modules'
    // exports remain tree-shakeable intra-program linkage, so DCE is preserved
    // (a no-export driver entry — the self-host build — emits ZERO host exports
    // and behaves exactly as today). v1 exports FUNCTIONS only; exported
    // `let`/`const` globals are filtered out (a possible follow-up).
    if (myIndex === 0) {
      const seen = new Set<string>();
      for (const exp of Object.values(program.moduleExports ?? {})) {
        if (exp.type.type !== "Function") continue; // v1: functions only
        // Defensive: two host exports sharing an `exportName` would collide as
        // wasm export names. Normally unreachable — re-exporting a name within one
        // module is already a parser redeclaration error, and `moduleExports` is
        // keyed by export name, so this loop visits each name once. Kept as a
        // cheap guard against future merge/parser changes.
        if (seen.has(exp.name)) {
          throw new Error(
            `Duplicate host export name "${exp.name}" in entry module`,
          );
        }
        seen.add(exp.name);
        hostExports.push({
          exportName: exp.name,
          internalName: rename.get(exp.name) ?? exp.name,
        });
      }
    }

    const mod: LoadedModule = {
      key,
      program,
      diagnostics: [],
      rename,
      importedLocals,
      symbols,
    };
    loaded.set(key, mod);
    loading.delete(key);
    return mod;
  };

  const entry = await load(entryKey);
  // Concatenate every loaded module's symbol occurrences into one table. This is
  // a flat union (no cross-file resolution yet — that's phase-3 LSP work); it is
  // enough for the build/run path, which doesn't query symbols by position.
  const symbols = new SymbolTable();
  for (const mod of loaded.values()) {
    for (const occ of mod.symbols.occurrences) symbols.occurrences.push(occ);
  }
  if (!entry) {
    return { ast: undefined, diagnostics, symbols, hostExports };
  }

  // Merge: rewrite each module's AST names through its rename map, then
  // concatenate statements in dependency-first (load) order so a dependency's
  // top-level initializers run before its dependents'. `loaded` preserves
  // insertion order, which IS dependency-first because `load` recurses into
  // imports before registering the importer.
  const mergedScope: Record<string, VLType> = defaultScope();
  const mergedStatements: VLStatement[] = [];
  for (const mod of loaded.values()) {
    rewriteNames(mod.program, mod.rename);
    // Fold the (now-mangled) top-level bindings into the one merged scope, and
    // append the (now-mangled, import-nop) statements. Imported locals are NOT
    // this module's own bindings — their references were rewritten to the
    // EXPORTING module's mangled name (already in `mergedScope`), so skip them.
    for (const [name, type] of Object.entries(mod.program.scope)) {
      if (isBuiltin(name)) continue; // builtins keep their names, already present
      if (mod.importedLocals.has(name)) continue; // bound by the exporter
      const mangled = mod.rename.get(name) ?? name;
      mergedScope[mangled] = type;
    }
    for (const stmt of mod.program.statements) mergedStatements.push(stmt);
  }

  const ast: VLProgramNode = {
    type: "Program",
    statements: mergedStatements,
    scope: mergedScope,
  };

  return { ast, diagnostics, symbols, hostExports };
};

// --- helpers ---------------------------------------------------------------

const BUILTIN_NAMES = new Set(Object.keys(defaultScope()));
const isBuiltin = (name: string): boolean => BUILTIN_NAMES.has(name);

/**
 * The module's top-level value/type names: every top-level `function`, `let`,
 * `const`, and `type` declaration. These are the names that must be mangled for
 * per-module isolation. Reads the program's `scope` (which the parser populated
 * with exactly these top-level bindings, minus builtins) rather than re-walking
 * statements — except types, which live in `scope` as `Type` entries too.
 */
const collectTopLevelNames = (
  program: VLProgramNode,
  importedLocals: Set<string>,
): string[] =>
  Object.keys(program.scope).filter((name) =>
    !isBuiltin(name) && !importedLocals.has(name)
  );

// Re-export the parser-error → diagnostic mapping shape. The single-file
// `compile.ts` owns the canonical mapping; we re-derive a minimal one here to
// avoid exporting parser internals. Keep the messages aligned with compile.ts.
import type { ParseErrors } from "./ast.ts";
import { stringifyType } from "./compile.ts";

const parseErrorToDiagnostic = (
  error: ParseErrors,
  _spans: NodeSpans,
): VLDiagnostic => {
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
    default: {
      const exhaustive: never = error;
      return {
        ...base,
        message: `Unhandled error: ${JSON.stringify(exhaustive)}`,
      };
    }
  }
};
