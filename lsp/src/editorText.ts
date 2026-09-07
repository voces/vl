// Helpers the two editor hosts share — the VS Code language server (`server.ts`)
// and the browser playground (`lspAdapter.ts`). Each drove its own copy of these
// before; they live here so a fix to one cannot skip the other. Monaco-free. The
// text helpers are pure string arithmetic over LSP 0-based coordinates;
// `stdExportSurfaces` additionally drives the injected wasm checker.

import type { ModuleReader } from "../../compiler/coreTypes.ts";
import { STD_SOURCES } from "../../std/embedded.ts";
import type { StdExportCandidate } from "./typeFeatures.ts";
import type { WasmChecker } from "./wasmChecker.ts";

// The identifier `[A-Za-z_][A-Za-z0-9_]*` immediately to the LEFT of `character`
// on `line`, or null — the `<name>.` member-completion receiver. A numeric run is
// rejected (an identifier cannot start with a digit).
export const wordEndingBefore = (
  line: string,
  character: number,
): string | null => {
  const isWordChar = (c: string) => /[A-Za-z0-9_]/.test(c);
  const end = character;
  let start = end;
  while (start > 0 && isWordChar(line[start - 1])) start--;
  if (start === end) return null;
  const word = line.slice(start, end);
  return /^[A-Za-z_]/.test(word) ? word : null;
};

// `text` with the single character at (0-based `line`, 0-based `col`) removed —
// used to strip a trailing `.` so the member-completion path resolves the
// receiver as a bare expression (the native parser is not error-tolerant for
// `receiver.`). A no-op if the position is out of range.
export const removeCharAt = (text: string, line: number, col: number): string => {
  const lines = text.split("\n");
  if (line < 0 || line >= lines.length) return text;
  const l = lines[line];
  if (col < 0 || col >= l.length) return text;
  lines[line] = l.slice(0, col) + l.slice(col + 1);
  return lines.join("\n");
};

// The per-std-module export surface (name / kind / type) that
// `stdAutoImportCompletions` ranks over — the shared core of `server.ts`'s
// `stdExportsForCompletion` and the playground's copy. The ONLY thing the two
// hosts differed on is the source read: the server tries its workspace `std/`
// first (dogfooding), the browser reads the embedded map only. That divergence
// is `readSrc` — return `undefined` to take the embedded source. `cache` is the
// caller's, keyed on module source text so a std edit refreshes its one entry.
export type StdSurfaceCache = Map<
  string,
  { src: string; exports: StdExportCandidate[] }
>;

const SCOPE_KINDS = ["variable", "parameter", "function"] as const;

export const stdExportSurfaces = async (
  checker: WasmChecker,
  reader: ModuleReader,
  readSrc: (key: string) => Promise<string | undefined> | string | undefined,
  cache: StdSurfaceCache,
): Promise<Map<string, StdExportCandidate[]>> => {
  const out = new Map<string, StdExportCandidate[]>();
  for (const key of Object.keys(STD_SOURCES)) {
    const src = (await readSrc(key)) ?? STD_SOURCES[key];
    const cached = cache.get(key);
    if (cached !== undefined && cached.src === src) {
      out.set(key, cached.exports);
      continue;
    }
    const surface = checker.moduleSurface(src, key);
    const lastLine = src.split("\n").length - 1;
    const scope = await checker.scopeAt(src, key, reader, lastLine, 0).catch(
      () => [],
    );
    const byName = new Map(scope.map((b) => [b.name, b]));
    const exports: StdExportCandidate[] = surface.exports.map((e) => {
      // A re-export has no binding in this module's own scope, so it carries its
      // origin instead of a type detail — the ranking in
      // `stdAutoImportCompletions` is what that origin is for.
      const b = e.origin === "" ? byName.get(e.name) : undefined;
      return {
        name: e.name,
        kind: b !== undefined ? SCOPE_KINDS[b.kind] ?? "function" : "function",
        detail: b !== undefined && b.type !== "" ? b.type : undefined,
        ...(e.origin === "" ? {} : { origin: e.origin }),
      };
    });
    cache.set(key, { src, exports });
    out.set(key, exports);
  }
  return out;
};
