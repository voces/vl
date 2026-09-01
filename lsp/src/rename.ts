// Rename symbol (D9.7) — the planning + edit-assembly layer behind
// `textDocument/prepareRename` and `textDocument/rename`.
//
// Like `typeFeatures.ts`/`moduleGraph.ts`, this module is runtime-agnostic (no
// `vscode-languageserver`, no `node:fs`) so Deno unit tests can drive it; the
// Node server (`server.ts`) wraps the results in the LSP wire shapes.
//
// The reference machinery this rides, and the two measured facts that shape it:
//
//   • `referencesAt` returns the binding's occurrences across EVERY committed
//     module, each at its own module-local line/col — so for an IMPORTED name
//     the dependency's decl occurrence arrives at coordinates that are wrong
//     for the current document. Rename therefore uses `referencesAt` only for
//     bindings DECLARED in the entry (all their occurrences are module 0 by
//     construction) and `referencesInEntry` (module-0-filtered) everywhere else.
//   • Import specifiers are parser-skipped: neither `import { add }`'s `add`
//     nor an `x as y` alias token has a symbol occurrence. The host-side
//     import-statement scan below is what finds and rewrites them, resolving
//     each statement's specifier with the same pure string math as the
//     compiler's `modResolveSpecifier` (`compiler/driver.vl`).
//
// ── Alias/import-edge semantics, as decided (D9.7) ─────────────────────────────
//
//   Cursor on…                          Renames…
//   a local, non-exported binding       every same-file occurrence (single-file)
//   an EXPORTED decl, or a use/import   the exported name everywhere: the decl,
//     specifier of a PLAIN import       every plain importer's uses, and every
//                                       import specifier's SOURCE side (aliased
//                                       importers keep their alias + uses)
//   the alias of `import { x as y }`    ONLY the local alias: the `y` token in
//     (the `y` token, or a use of `y`)  the import + this file's uses of `y`
//   the source side (`x`) of an         the exported name everywhere — same as
//     `x as y` specifier                renaming at its decl
//
//   Refused for safety (a wrong rename is worse than no rename):
//   • any binding whose declaration lives in a `std:` module (or, via the
//     host's `isStdKey`, under the workspace's own `std/` dir) — std is
//     version-locked to the compiler, so renaming it from a user project is
//     corruption;
//   • a file importing the SAME export both plainly and under an alias
//     (`import { x, x as y }`): the checker rewrites both locals to one
//     canonical binding id, so their uses cannot be attributed to either
//     specifier; likewise two aliases of one export;
//   • a new name that fails the identifier grammar or is a hard OR soft
//     keyword (soft keywords are contextual, but a binding named `in`/`to`/
//     `step`/`as`/`from` re-parses as syntax in `for` headers and imports);
//   • an import specifier whose statement does not resolve (no references to
//     track).

import type { ModuleReader } from "../../compiler/coreTypes.ts";
import type { WasmChecker } from "./wasmChecker.ts";
import {
  type LspRange,
  offsetToPos,
  VL_HARD_KEYWORDS,
  VL_SOFT_KEYWORDS,
} from "./typeFeatures.ts";
import { type OpenDocument, pathToUri, uriToPath } from "./moduleGraph.ts";

// ---- new-name validation -----------------------------------------------------

const IDENT_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

/**
 * Why `newName` cannot be a binding name, or `undefined` when it can. The
 * grammar is the identifier grammar (`[A-Za-z_][A-Za-z0-9_]*`); the refused
 * word list is the lexer's hard keywords PLUS the parser's contextual soft
 * keywords (see the module header for why soft keywords are refused too).
 */
export const invalidNewNameReason = (newName: string): string | undefined => {
  if (!IDENT_RE.test(newName)) {
    return `'${newName}' is not a valid VL identifier ([A-Za-z_][A-Za-z0-9_]*)`;
  }
  if (VL_HARD_KEYWORDS.includes(newName)) {
    return `'${newName}' is a reserved keyword`;
  }
  if (VL_SOFT_KEYWORDS.includes(newName)) {
    return `'${newName}' is a contextual keyword (soft keyword) — a binding ` +
      `with this name re-parses as syntax in for-headers and imports`;
  }
  return undefined;
};

// ---- cursor word extraction --------------------------------------------------

/**
 * The identifier straddling `character` on the 0-based `line` of `source`, with
 * its exact range — the span `prepareRename` returns so the client shows the
 * right placeholder. `undefined` when the cursor is not on a word or the word
 * is number-shaped (a literal, not an identifier).
 */
export const wordRangeAt = (
  source: string,
  line: number,
  character: number,
): { word: string; range: LspRange } | undefined => {
  const text = source.split("\n")[line] ?? "";
  const isWordChar = (c: string) => /[A-Za-z0-9_]/.test(c);
  let start = character;
  let end = character;
  while (start > 0 && isWordChar(text[start - 1])) start--;
  while (end < text.length && isWordChar(text[end])) end++;
  if (start === end) return undefined;
  const word = text.slice(start, end);
  if (!/^[A-Za-z_]/.test(word)) return undefined; // numeric literal
  return {
    word,
    range: {
      start: { line, character: start },
      end: { line, character: end },
    },
  };
};

// ---- import specifier scan ---------------------------------------------------

/**
 * Resolve an import specifier written in the module at `fromKey` to a module
 * key, or `""` for a kind the compiler's resolver rejects. A pure-string-math
 * mirror of `modResolveSpecifier` (`compiler/driver.vl`): a well-formed `std:`
 * specifier IS its key (verbatim); a relative specifier resolves against
 * `fromKey`'s directory with `.`/`..` normalization and `.vl` appended;
 * everything else (bare specifiers, relative-inside-std) is unresolvable.
 */
export const resolveImportSpecifier = (spec: string, fromKey: string): string => {
  if (/^std:[a-z0-9_]+(\/[a-z0-9_]+)*$/.test(spec)) return spec;
  if (!spec.startsWith("./") && !spec.startsWith("../")) return "";
  if (fromKey.startsWith("std:")) return "";
  const slash = fromKey.lastIndexOf("/");
  const base = slash >= 0 ? fromKey.slice(0, slash) : "";
  const joined = base !== "" ? `${base}/${spec}` : spec;
  // Normalize, collapsing `.` and `..` segments (leading `..` that escape the
  // root are kept — the key stays distinct and the reader won't find it).
  const absolute = joined.startsWith("/");
  const segs: string[] = [];
  for (const seg of joined.split("/")) {
    if (seg === "" || seg === ".") continue;
    if (seg === ".." && segs.length > 0 && segs[segs.length - 1] !== "..") {
      segs.pop();
    } else {
      segs.push(seg);
    }
  }
  return (absolute ? "/" : "") + segs.join("/") + ".vl";
};

/**
 * One specifier of an `import { … } from "…"` statement, located exactly:
 * `sourceName`/`sourceRange` are the exported-name token (`x` in `x` or
 * `x as y`); `localName` is the name the import binds here (`y` for an alias,
 * else `sourceName`), with `localRange` set only for an alias; `key` is the
 * statement's specifier resolved via {@link resolveImportSpecifier} (`""` when
 * unresolvable).
 */
export type ImportSpecifierToken = {
  sourceName: string;
  sourceRange: LspRange;
  localName: string;
  localRange: LspRange | undefined;
  key: string;
};

/**
 * Locate every import specifier token in `source` (the module at `entryKey`).
 * The statement scan is the same statement-spanning regex `organizeImportEdits`
 * walks (`[^}]*` crosses newlines, keeping a multi-line import whole), gated to
 * LINE-LEADING `import` — the compiler's own module gate — so a commented-out
 * or string-embedded lookalike is skipped. A specifier that isn't `name` /
 * `name as local` shaped is skipped (no edit is safer than a wrong one).
 */
export const scanImportSpecifiers = (
  source: string,
  entryKey: string,
): ImportSpecifierToken[] => {
  const out: ImportSpecifierToken[] = [];
  const stmtRe = /import\s*\{([^}]*)\}\s*from\s*"([^"]*)"/g;
  for (let m = stmtRe.exec(source); m !== null; m = stmtRe.exec(source)) {
    // Line-leading gate: only whitespace between the line start and `import`.
    const lineStart = source.lastIndexOf("\n", m.index - 1) + 1;
    if (source.slice(lineStart, m.index).trim() !== "") continue;
    const key = resolveImportSpecifier(m[2], entryKey);
    const list = m[1];
    const listStart = m.index + m[0].indexOf("{") + 1;
    const segRe =
      /^(\s*)([A-Za-z_][A-Za-z0-9_]*)(?:(\s+as\s+)([A-Za-z_][A-Za-z0-9_]*))?\s*$/;
    let segStart = 0;
    const segments: { start: number; text: string }[] = [];
    for (let i = 0; i <= list.length; i++) {
      if (i === list.length || list[i] === ",") {
        segments.push({ start: segStart, text: list.slice(segStart, i) });
        segStart = i + 1;
      }
    }
    for (const seg of segments) {
      const sm = segRe.exec(seg.text);
      if (sm === null) continue; // empty or malformed segment
      const srcOff = listStart + seg.start + sm[1].length;
      const sourceName = sm[2];
      const srcStart = offsetToPos(source, srcOff);
      const sourceRange: LspRange = {
        start: srcStart,
        end: { line: srcStart.line, character: srcStart.character + sourceName.length },
      };
      let localName = sourceName;
      let localRange: LspRange | undefined;
      if (sm[4] !== undefined) {
        localName = sm[4];
        const localOff = srcOff + sourceName.length + sm[3].length;
        const localStart = offsetToPos(source, localOff);
        localRange = {
          start: localStart,
          end: {
            line: localStart.line,
            character: localStart.character + localName.length,
          },
        };
      }
      out.push({ sourceName, sourceRange, localName, localRange, key });
    }
  }
  return out;
};

// ---- rename planning ---------------------------------------------------------

/**
 * The canonical export a cross-module rename targets — the same shape
 * `WasmChecker.referencesInEntry` consumes (1-based native `declLine`,
 * 0-based `declCol`, both of the decl NAME in the declaring module).
 */
export type RenameTarget = {
  key: string;
  exportedName: string;
  declLine: number;
  declCol: number;
};

/**
 * What renaming at a position would do (see the module-header semantics table):
 *   `local`       — a binding declared in the entry, not exported: rewrite its
 *                   same-file occurrences (already collected, all module 0).
 *   `export`      — the exported name everywhere (decl + plain importers' uses
 *                   + every specifier's source side).
 *   `alias-local` — only the local alias of an `x as y` import (the alias token
 *                   + this file's uses).
 *   `refused`     — a nameable symbol rename declines, with the reason (shown
 *                   to the user); distinct from `undefined` (not on a symbol).
 */
export type RenamePlan =
  | { kind: "local"; word: string; range: LspRange; occurrences: LspRange[] }
  | { kind: "export"; word: string; range: LspRange; target: RenameTarget }
  | {
    kind: "alias-local";
    word: string;
    range: LspRange;
    target: RenameTarget;
    occurrences: LspRange[];
  }
  | { kind: "refused"; reason: string };

const posInRange = (r: LspRange, line: number, character: number): boolean =>
  r.start.line === line && r.start.character <= character &&
  character <= r.end.character;

const stdRefusal = (key: string): string =>
  `cannot rename a symbol declared in a std module (${key}) — std is ` +
  `version-locked to the compiler; alias the import instead ` +
  `(\`import { x as y }\`)`;

/** How the entry imports `target`, for the mixed-form safety check. */
const matchingSpecs = (
  specs: ImportSpecifierToken[],
  target: RenameTarget,
): ImportSpecifierToken[] =>
  specs.filter(
    (s) => s.key === target.key && s.sourceName === target.exportedName,
  );

const MIXED_IMPORT_REFUSAL =
  "cannot rename: this export is imported more than once in one file (e.g. " +
  "plainly and under an alias), so its occurrences cannot be attributed to " +
  "one specifier";

/**
 * Classify the rename at (`line`, `character`) (0-based LSP) in `source` (the
 * document at `entryKey`). `undefined` = the position names no renameable
 * symbol at all (keywords, literals, unresolved words — `prepareRename`
 * returns null); a `refused` plan carries a reason worth surfacing.
 *
 * `isStdKey` decides what counts as a std declaration (the hard refusal); the
 * default is the `std:` key scheme — the server additionally treats the
 * workspace's own `std/` dir as std (dogfooding in the compiler repo).
 */
export const planRenameAt = async (
  source: string,
  entryKey: string,
  read: ModuleReader,
  checker: WasmChecker,
  line: number,
  character: number,
  isStdKey: (key: string) => boolean = (k) => k.startsWith("std:"),
): Promise<RenamePlan | undefined> => {
  const at = wordRangeAt(source, line, character);
  if (at === undefined) return undefined;
  const { word, range } = at;
  if (VL_HARD_KEYWORDS.includes(word)) return undefined; // keyword/literal

  const sources = await checker.importedNameSources(source, entryKey, read);
  const specs = scanImportSpecifiers(source, entryKey);

  const targetOf = (localName: string): RenameTarget | undefined => {
    const src = sources[localName];
    if (src === undefined) return undefined;
    return {
      key: src.key,
      exportedName: src.exportedName,
      declLine: src.line,
      declCol: src.col,
    };
  };

  // ── Cursor inside an import statement's specifier list? ─────────────────────
  for (const spec of specs) {
    const onLocal = spec.localRange !== undefined &&
      posInRange(spec.localRange, line, character);
    const onSource = posInRange(spec.sourceRange, line, character);
    if (!onLocal && !onSource) continue;
    if (spec.key === "") {
      return {
        kind: "refused",
        reason:
          "cannot rename: the import does not resolve, so its references cannot be tracked",
      };
    }
    const target = targetOf(spec.localName);
    if (target === undefined) {
      // Resolvable statement but the name isn't served by the exporter
      // (not exported / graph error) — nothing safe to rewrite.
      return {
        kind: "refused",
        reason:
          "cannot rename: the imported name does not resolve to an export, so its references cannot be tracked",
      };
    }
    if (onLocal) {
      // The alias token of `x as y`: rename ONLY the local alias.
      if (matchingSpecs(specs, target).length > 1) {
        return { kind: "refused", reason: MIXED_IMPORT_REFUSAL };
      }
      const occurrences = (await checker.referencesInEntry(
        source,
        entryKey,
        read,
        target,
      )).map((o) => o.range);
      return {
        kind: "alias-local",
        word: spec.localName,
        range: spec.localRange!,
        target,
        occurrences,
      };
    }
    // The source side (`x` of `x` or `x as y`): the exported name everywhere.
    if (isStdKey(target.key)) {
      return { kind: "refused", reason: stdRefusal(target.key) };
    }
    return { kind: "export", word: spec.sourceName, range: spec.sourceRange, target };
  }

  // ── Cursor on a use of an imported binding? ─────────────────────────────────
  // `sources` keys by the LOCAL name, which is what a use spells. Confirm the
  // cursor really is on that binding's occurrence (not a same-named local that
  // shadows the import) via the module-0 occurrence set.
  const importedTarget = targetOf(word);
  if (importedTarget !== undefined) {
    const occs = await checker.referencesInEntry(source, entryKey, read, importedTarget);
    if (occs.some((o) => posInRange(o.range, line, character))) {
      if (matchingSpecs(specs, importedTarget).length > 1) {
        return { kind: "refused", reason: MIXED_IMPORT_REFUSAL };
      }
      if (word !== importedTarget.exportedName) {
        // A use of the local alias: rename only the alias.
        return {
          kind: "alias-local",
          word,
          range,
          target: importedTarget,
          occurrences: occs.map((o) => o.range),
        };
      }
      // A use of a plainly-imported name: rename the export everywhere.
      if (isStdKey(importedTarget.key)) {
        return { kind: "refused", reason: stdRefusal(importedTarget.key) };
      }
      return { kind: "export", word, range, target: importedTarget };
    }
    // Fall through: the cursor is on a same-named binding that shadows the
    // import — a local rename below.
  }

  // ── A binding declared in the entry module. ─────────────────────────────────
  // All of a locally-declared binding's occurrences are module 0 by
  // construction (the entry's compile spans its imports, never its importers),
  // so `referencesAt`'s bare ranges are directly usable here.
  const refs = await checker.referencesAt(source, entryKey, read, line, character, true);
  if (refs.length === 0) return undefined; // not a tracked binding (type/builtin/…)

  // Exported? The decl occurrence sits at the surface's export decl position.
  const surface = checker.moduleSurface(source, entryKey);
  const exp = surface.exports.find((e) => e.name === word);
  if (
    exp !== undefined &&
    refs.some((r) =>
      r.start.line === exp.declLine - 1 && r.start.character === exp.declCol
    )
  ) {
    if (isStdKey(entryKey)) {
      return { kind: "refused", reason: stdRefusal(entryKey) };
    }
    return {
      kind: "export",
      word,
      range,
      target: {
        key: entryKey,
        exportedName: exp.name,
        declLine: exp.declLine,
        declCol: exp.declCol,
      },
    };
  }

  return { kind: "local", word, range, occurrences: refs };
};

// ---- edit assembly -----------------------------------------------------------

/** Edits per document URI — the neutral form of an LSP `WorkspaceEdit.changes`. */
export type RenameEditsByUri = Record<
  string,
  { range: LspRange; newText: string }[]
>;

const rangeKey = (r: LspRange): string =>
  `${r.start.line}:${r.start.character}-${r.end.line}:${r.end.character}`;

/** Append `ranges` as `newText` edits under `uri`, deduplicated by (uri, range). */
const addEdits = (
  changes: RenameEditsByUri,
  seen: Set<string>,
  uri: string,
  ranges: LspRange[],
  newText: string,
): void => {
  for (const range of ranges) {
    const k = `${uri}|${rangeKey(range)}`;
    if (seen.has(k)) continue;
    seen.add(k);
    (changes[uri] ??= []).push({ range, newText });
  }
};

/**
 * Assemble the workspace edits for a non-refused {@link RenamePlan}.
 *
 * `local` / `alias-local` touch only the entry document (`entryUri`). `export`
 * ranges over the entry + every open document + the capped disk crawl's files
 * (`diskFiles`, from `enumerateWorkspaceFiles` — the same machinery as
 * find-references), one `referencesInEntry` compile per candidate; per
 * candidate, an aliased importer contributes only its specifier's SOURCE-side
 * token (its alias and uses are kept), and a mixed plain+alias importer
 * refuses the whole rename (see the module header).
 *
 * Returns `{ error }` instead of edits when a candidate makes the rename
 * unsafe — the caller surfaces the message and applies nothing.
 */
export const renameEdits = async (
  plan: Exclude<RenamePlan, { kind: "refused" }>,
  newName: string,
  entrySource: string,
  entryKey: string,
  entryUri: string,
  openDocs: OpenDocument[],
  diskFiles: string[],
  read: ModuleReader,
  checker: WasmChecker,
): Promise<{ changes: RenameEditsByUri } | { error: string }> => {
  const changes: RenameEditsByUri = {};
  const seen = new Set<string>();

  if (plan.kind === "local") {
    addEdits(changes, seen, entryUri, plan.occurrences, newName);
    return { changes };
  }

  if (plan.kind === "alias-local") {
    // The alias token in the import statement (no symbol occurrence — the
    // import is parser-skipped) + this file's uses of the alias.
    const aliasTokens = matchingSpecs(
      scanImportSpecifiers(entrySource, entryKey),
      plan.target,
    )
      .filter((s) => s.localName === plan.word && s.localRange !== undefined)
      .map((s) => s.localRange!);
    addEdits(changes, seen, entryUri, aliasTokens, newName);
    addEdits(changes, seen, entryUri, plan.occurrences, newName);
    return { changes };
  }

  // ── kind === "export": the canonical export, everywhere. ────────────────────
  const target = plan.target;

  // Candidate documents: the entry, every open doc, and the disk crawl's files
  // not already covered — deduplicated by module key, open-buffer text winning
  // (the same assembly as `crossFileReferences`).
  const docsByKey = new Map<string, { uri: string; text: string }>();
  docsByKey.set(entryKey, { uri: entryUri, text: entrySource });
  for (const d of openDocs) {
    const key = uriToPath(d.uri);
    if (!docsByKey.has(key)) docsByKey.set(key, { uri: d.uri, text: d.text });
  }
  for (const diskPath of diskFiles) {
    if (docsByKey.has(diskPath)) continue;
    const text = await read(diskPath);
    if (text === undefined) continue;
    docsByKey.set(diskPath, { uri: pathToUri(diskPath), text });
  }

  for (const [docKey, doc] of docsByKey) {
    const specs = matchingSpecs(scanImportSpecifiers(doc.text, docKey), target);
    const plain = specs.filter((s) => s.localRange === undefined);
    const aliased = specs.filter((s) => s.localRange !== undefined);
    if (plain.length > 0 && aliased.length > 0) {
      return {
        error: `${MIXED_IMPORT_REFUSAL} (${doc.uri})`,
      };
    }
    // Every specifier's SOURCE side spells the exported name — rewrite it
    // whether plain (`{ x }` → `{ z }`, matching the uses below) or aliased
    // (`{ x as y }` → `{ z as y }`, alias + uses untouched).
    addEdits(changes, seen, doc.uri, specs.map((s) => s.sourceRange), newName);

    // Occurrences: the declaring file's decl + same-file uses, and a PLAIN
    // importer's uses. An aliased importer's occurrences are its ALIAS's uses
    // (the checker rewrites the alias to the canonical binding id — measured),
    // so they are excluded: the alias keeps its name.
    if (docKey !== target.key && aliased.length > 0) continue;
    const occs = await checker.referencesInEntry(doc.text, docKey, read, target);
    addEdits(changes, seen, doc.uri, occs.map((o) => o.range), newName);
  }

  return { changes };
};
