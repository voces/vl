// Dependency-free type vocabulary shared between the compiler and the tooling
// that outlives it (the LSP server, the playground). Like `diagnostics.ts`, this
// is a LEAF: it imports nothing and carries no runtime, so a consumer can name
// these types without dragging in the compiler core. The core re-exports each
// from its original home (`ast.ts` / `symbols.ts` / `modules.ts`), so internal
// imports are unchanged; the editor layer imports them from HERE, so it keeps
// compiling once the core `compiler/*.ts` is deleted (kill-TS).

/** A source position: 1-based line, 0-based column (the convention the
 * diagnostics layer expects — see `rangeFromCtx` in compile.ts). */
export type Position = { line: number; column: number };

/** What kind of thing a name binds to (drives nothing yet; useful for clients). */
export type BindingKind = "variable" | "parameter" | "function" | "type";

/** A resolved module specifier — the absolute-ish key the graph dedupes on. */
export type ModuleKey = string;

/**
 * Reads a module's source given its resolved key, or returns `undefined` when no
 * such module exists. Injected by the caller (filesystem in the CLI, an in-memory
 * map in tests). Keys are whatever `resolveSpecifier` produces — for relative
 * imports, a normalized path with the `.vl` extension appended.
 */
export type ModuleReader = (
  key: ModuleKey,
) => string | undefined | Promise<string | undefined>;
