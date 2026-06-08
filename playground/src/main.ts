/// <reference lib="dom" />
/// <reference lib="dom.iterable" />
// Wires the Monaco editor + the client-side "language server" to the DOM.
// Bundled into dist/playground.js by build.ts.
//
// VL's language server runs IN THE BROWSER: the compiler and the LSP
// feature-helpers are pure TS, so the same logic `lsp/src/server.ts` runs per
// request runs here on the current Monaco model. `lspAdapter.ts` is the bridge
// (pure, Monaco-free); this file maps its results onto Monaco's provider APIs:
//   - diagnostics  → `monaco.editor.setModelMarkers` (debounced on edit, per file)
//   - semantic tokens → a `DocumentSemanticTokensProvider`
//   - hover        → a `HoverProvider`
//   - inlay hints  → an `InlayHintsProvider`
//   - definition   → a `DefinitionProvider`
//
// The surface is a branded restyle (light/dark theme pair) with three structural
// features layered on the existing real compiler/LSP/share/format:
//   1. Results-as-tabs (Output / WAT / Diagnostics in one tabbed panel).
//   2. Multi-file projects — one Monaco model per file (`inmemory://` URIs);
//      per-file diagnostics aggregate; Run/WAT compile the whole graph to one
//      wasm module (`runProject` → `compileProgram`), per VL's module model.
//   3. Auto-run — always-on debounced diagnostics + WAT emit (pure analysis,
//      safe); execution stays opt-in behind a toggle (a `while true {}` would
//      hang the tab; the sandboxed-Worker execution is roadmap E3 — see the
//      execution note in `run()`).
//
// Loading binaryen runs a top-level await inside the bundle (this file →
// playground.ts → compile.ts → toWasm.ts → binaryen), so the module finishes
// evaluating only once the wasm toolchain is instantiated — the headline
// client-side-binaryen risk. We surface that with a loading state.
//
// Workers: Monaco's optional language workers (TS/JSON/CSS/HTML) are off — we
// register only a `vital` language with our own providers, so no built-in
// worker is needed. `MonacoEnvironment.getWorker` returns a tiny inline no-op
// worker (kept off the deno-loader bundling path, which doesn't handle Monaco's
// `new Worker(new URL(...))` pattern). The editor + every VL provider run on the
// main thread.

import * as monaco from "monaco-editor";
import {
  checkProject,
  runProgram,
  runProject,
  type VLDiagnostic,
} from "./playground.ts";
import { SAMPLES, type Sample } from "./samples.ts";
import * as lsp from "./lspAdapter.ts";
import { decodeHash, encodeSource } from "./share.ts";
import { loadLastSession, saveLastSession } from "./projects.ts";
import { format } from "../../compiler/format.ts";

const VL_LANGUAGE_ID = "vital";
const ENTRY_FILE = "main.vl";

// --- Monaco worker environment ---------------------------------------------
//
// Monaco asks for workers for its built-in languages. We register none of those
// (only `vital`), but Monaco still consults this on init. Return a no-op inline
// worker so it never tries to fetch a worker bundle the deno-loader can't make.
const noopWorker = () => {
  const blob = new Blob(["self.onmessage=()=>{};"], {
    type: "text/javascript",
  });
  return new Worker(URL.createObjectURL(blob));
};
(globalThis as unknown as { MonacoEnvironment: unknown }).MonacoEnvironment = {
  getWorker: () => noopWorker(),
};

const $ = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`missing #${id}`);
  return el as T;
};

const editorHost = $<HTMLDivElement>("editor");
const runBtn = $<HTMLButtonElement>("run");
const shareBtn = $<HTMLButtonElement>("share");
const formatBtn = $<HTMLButtonElement>("format");
const autorunBtn = $<HTMLButtonElement>("autorun");
const themeBtn = $<HTMLButtonElement>("theme");
const faddBtn = $<HTMLButtonElement>("fadd");
const pickerBtn = $<HTMLButtonElement>("pickerBtn");
const menuEl = $<HTMLDivElement>("menu");
const pickerName = $<HTMLSpanElement>("pickerName");
const ftabsEl = $<HTMLDivElement>("ftabs");
const editorMeta = $<HTMLSpanElement>("editorMeta");
const tabMeta = $<HTMLSpanElement>("tabMeta");
const watCount = $<HTMLSpanElement>("watCount");
const diagCount = $<HTMLSpanElement>("diagCount");
const veil = $<HTMLDivElement>("veil");
const appEl = $<HTMLDivElement>("app");

const statusText = $<HTMLSpanElement>("status");
const statusFile = $<HTMLSpanElement>("statusFile");
const statusCursor = $<HTMLSpanElement>("statusCursor");
const statusSize = $<HTMLSpanElement>("statusSize");
const liveDot = $<HTMLSpanElement>("live");

const diagnosticsPane = $<HTMLDivElement>("diagnostics");
const logPane = $<HTMLDivElement>("log");
const watPane = $<HTMLDivElement>("wat");

// --- language registration --------------------------------------------------

monaco.languages.register({
  id: VL_LANGUAGE_ID,
  aliases: ["VL", "Vital"],
  extensions: [".vl"],
});

// A minimal Monarch grammar as a fallback for strings/comments/numbers — the
// semantic-token provider does the accurate identifier/member colouring, but
// Monarch runs first and synchronously, so strings and comments are coloured
// even before semantic tokens resolve (and inside an erroring document).
monaco.languages.setMonarchTokensProvider(VL_LANGUAGE_ID, {
  defaultToken: "",
  keywords: [
    "fn", "function", "if", "then", "else", "elseif", "while", "for", "to",
    "step", "in", "const", "let", "return", "is", "await", "break", "continue",
    "from", "type", "import", "export", "as", "true", "false", "null",
  ],
  tokenizer: {
    root: [
      [/\/\/.*$/, "comment"],
      [/"(?:[^"\\]|\\.)*"/, "string"],
      [/'(?:[^'\\]|\\.)*'/, "string"],
      [/\b\d[\d_]*(?:\.\d[\d_]*)?\b/, "number"],
      [
        /[a-zA-Z_]\w*/,
        { cases: { "@keywords": "keyword", "@default": "identifier" } },
      ],
      [/[+\-*/%^=<>!&|?]+/, "operator"],
    ],
  },
});

monaco.languages.setLanguageConfiguration(VL_LANGUAGE_ID, {
  comments: { lineComment: "//" },
  brackets: [["{", "}"], ["[", "]"], ["(", ")"]],
  autoClosingPairs: [
    { open: "{", close: "}" },
    { open: "[", close: "]" },
    { open: "(", close: ")" },
    { open: '"', close: '"' },
    { open: "'", close: "'" },
  ],
});

// --- themes -----------------------------------------------------------------
//
// The branded light/dark theme pair, pasted ~verbatim from the design handoff's
// `vital-monaco.js`. Switched in lock-step with the `data-mode` attribute on
// `.app` via `monaco.editor.setTheme(...)`.
monaco.editor.defineTheme("vital-light", {
  base: "vs",
  inherit: true,
  rules: [
    { token: "comment", foreground: "8a978d", fontStyle: "italic" },
    { token: "keyword", foreground: "8250df" },
    { token: "type", foreground: "0e7c86" },
    { token: "function", foreground: "1f6feb" },
    { token: "method", foreground: "1f6feb" },
    { token: "number", foreground: "b35900" },
    { token: "string", foreground: "138a52" },
    { token: "string.escape", foreground: "0c7d51" },
    { token: "constant", foreground: "b35900" },
    { token: "boolean", foreground: "b35900" },
    { token: "operator", foreground: "5f6f66" },
    { token: "variable", foreground: "16201b" },
    { token: "parameter", foreground: "16201b" },
    { token: "property", foreground: "16201b" },
    { token: "identifier", foreground: "16201b" },
    { token: "delimiter", foreground: "8a978d" },
  ],
  colors: {
    "editor.background": "#ffffff",
    "editor.foreground": "#16201b",
    "editorLineNumber.foreground": "#bcc7be",
    "editorLineNumber.activeForeground": "#10915f",
    "editor.lineHighlightBackground": "#f3f7f1",
    "editor.lineHighlightBorder": "#00000000",
    "editor.selectionBackground": "#cdeede",
    "editor.inactiveSelectionBackground": "#e6f1ea",
    "editorCursor.foreground": "#10915f",
    "editorIndentGuide.background1": "#eef2ec",
    "editorIndentGuide.activeBackground1": "#d6e0d8",
    "editorInlayHint.foreground": "#9aa39c",
    "editorInlayHint.background": "#eef3eccc",
    "editorBracketMatch.background": "#cdeede",
    "editorBracketMatch.border": "#00000000",
    "editorWidget.background": "#ffffff",
    "editorWidget.border": "#e3e8e1",
    "editorHoverWidget.background": "#ffffff",
    "editorHoverWidget.border": "#e3e8e1",
    "scrollbarSlider.background": "#16201b1a",
    "scrollbarSlider.hoverBackground": "#16201b2e",
  },
});
monaco.editor.defineTheme("vital-dark", {
  base: "vs-dark",
  inherit: true,
  rules: [
    { token: "comment", foreground: "5d6b62", fontStyle: "italic" },
    { token: "keyword", foreground: "b39dff" },
    { token: "type", foreground: "5fd0c5" },
    { token: "function", foreground: "6cb6ff" },
    { token: "method", foreground: "6cb6ff" },
    { token: "number", foreground: "e0a878" },
    { token: "string", foreground: "7fd1a6" },
    { token: "string.escape", foreground: "9ee0bb" },
    { token: "constant", foreground: "e0a878" },
    { token: "boolean", foreground: "e0a878" },
    { token: "operator", foreground: "9fb0a6" },
    { token: "variable", foreground: "cdd4cd" },
    { token: "parameter", foreground: "cdd4cd" },
    { token: "property", foreground: "cdd4cd" },
    { token: "identifier", foreground: "cdd4cd" },
    { token: "delimiter", foreground: "7f9088" },
  ],
  colors: {
    "editor.background": "#0e1512",
    "editor.foreground": "#d6ddd6",
    "editorLineNumber.foreground": "#3c4a42",
    "editorLineNumber.activeForeground": "#2fb87f",
    "editor.lineHighlightBackground": "#15201b",
    "editor.lineHighlightBorder": "#00000000",
    "editor.selectionBackground": "#1f4636",
    "editor.inactiveSelectionBackground": "#172b22",
    "editorCursor.foreground": "#2fb87f",
    "editorIndentGuide.background1": "#1b261f",
    "editorIndentGuide.activeBackground1": "#2c3a31",
    "editorInlayHint.foreground": "#8b9890",
    "editorInlayHint.background": "#17211c",
    "editorBracketMatch.background": "#1f4636",
    "editorBracketMatch.border": "#00000000",
    "editorWidget.background": "#121a16",
    "editorWidget.border": "#1f2a24",
    "editorHoverWidget.background": "#121a16",
    "editorHoverWidget.border": "#1f2a24",
    "scrollbarSlider.background": "#d6ddd618",
    "scrollbarSlider.hoverBackground": "#d6ddd62e",
  },
});

// --- semantic tokens provider -----------------------------------------------
const semanticLegend: monaco.languages.SemanticTokensLegend = {
  tokenTypes: lsp.SEMANTIC_TOKEN_LEGEND.tokenTypes,
  tokenModifiers: lsp.SEMANTIC_TOKEN_LEGEND.tokenModifiers,
};

monaco.languages.registerDocumentSemanticTokensProvider(VL_LANGUAGE_ID, {
  getLegend: () => semanticLegend,
  provideDocumentSemanticTokens: (model) => ({
    data: new Uint32Array(lsp.semanticTokens(model.getValue())),
    resultId: undefined,
  }),
  releaseDocumentSemanticTokens: () => {},
});

// --- hover provider ----------------------------------------------------------

monaco.languages.registerHoverProvider(VL_LANGUAGE_ID, {
  provideHover: (model, position) => {
    const result = lsp.hover(model.getValue(), {
      line: position.lineNumber - 1, // Monaco 1-based line → LSP 0-based
      character: position.column - 1, // Monaco 1-based col → LSP 0-based
    });
    if (!result) return null;
    const range = result.range
      ? new monaco.Range(
        result.range.start.line + 1,
        result.range.start.character + 1,
        result.range.end.line + 1,
        result.range.end.character + 1,
      )
      : undefined;
    return {
      range,
      contents: [{ value: "```" + VL_LANGUAGE_ID + "\n" + result.contents + "\n```" }],
    };
  },
});

// --- inlay hints provider ----------------------------------------------------

monaco.languages.registerInlayHintsProvider(VL_LANGUAGE_ID, {
  provideInlayHints: (model, range) => {
    const hints = lsp.inlayHints(model.getValue(), {
      start: { line: range.startLineNumber - 1, character: range.startColumn - 1 },
      end: { line: range.endLineNumber - 1, character: range.endColumn - 1 },
    });
    return {
      hints: hints.map((h) => ({
        position: { lineNumber: h.line + 1, column: h.character + 1 },
        label: h.label,
        kind: monaco.languages.InlayHintKind.Type,
        paddingLeft: true,
      })),
      dispose: () => {},
    };
  },
});

// --- definition provider -----------------------------------------------------

monaco.languages.registerDefinitionProvider(VL_LANGUAGE_ID, {
  provideDefinition: (model, position) => {
    const def = lsp.definition(model.getValue(), {
      line: position.lineNumber - 1,
      character: position.column - 1,
    });
    if (!def) return null;
    return {
      uri: model.uri,
      range: new monaco.Range(
        def.start.line + 1,
        def.start.character + 1,
        def.end.line + 1,
        def.end.character + 1,
      ),
    };
  },
});

// --- theme management --------------------------------------------------------
//
// Tri-state: AUTO (follow OS) by default; clicking pins an explicit override;
// a second click that would match the OS reverts back to AUTO.
//
// Storage key "vl-theme":
//   absent / "system"  → AUTO (follow OS via matchMedia)
//   "light" | "dark"   → explicit override

const SUN =
  '<svg width="17" height="17" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><circle cx="8" cy="8" r="3.1"/><path d="M8 1v1.6M8 13.4V15M15 8h-1.6M2.6 8H1M12.95 3.05l-1.13 1.13M4.18 11.82l-1.13 1.13M12.95 12.95l-1.13-1.13M4.18 4.18L3.05 3.05"/></svg>';
const MOON =
  '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M13.5 9.5A5.5 5.5 0 0 1 6.5 2.5a5.5 5.5 0 1 0 7 7z"/></svg>';

export type Mode = "light" | "dark";

/** Returns the current OS color-scheme preference. */
export const systemMode = (): Mode =>
  matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";

/** Returns the stored explicit override, or null when in AUTO mode. */
export const storedOverride = (): Mode | null => {
  const v = localStorage.getItem("vl-theme");
  return v === "light" || v === "dark" ? v : null;
};

/** The mode that is actually rendered (override ?? OS). */
export const effectiveMode = (): Mode => storedOverride() ?? systemMode();

/**
 * Pure decision function for a toggle click.
 * Given the current effective mode and the current OS mode, returns what the
 * new state should be: an explicit override to store, or null to go AUTO.
 *
 * Exported for unit tests; DOM wiring happens below.
 */
export const nextThemeState = (
  current: Mode,
  system: Mode,
): { override: Mode | null; mode: Mode } => {
  const next: Mode = current === "dark" ? "light" : "dark";
  if (next === system) {
    // Clicking back to what the OS already is → revert to AUTO.
    return { override: null, mode: system };
  }
  return { override: next, mode: next };
};

const applyMode = (mode: Mode) => {
  appEl.dataset.mode = mode;
  // Keep <html>'s data-mode (seeded synchronously by the inline head script to
  // kill the load flash) in lock-step — the `html[data-mode] .app` flash-guard
  // selector outranks `.app[data-mode]`, so a stale value here would override a
  // toggle.
  document.documentElement.dataset.mode = mode;
  themeBtn.innerHTML = mode === "dark" ? SUN : MOON;
  monaco.editor.setTheme(mode === "dark" ? "vital-dark" : "vital-light");
};
const currentMode = (): Mode => (appEl.dataset.mode === "dark" ? "dark" : "light");

// Initial load: apply the effective mode (override if set, else OS).
applyMode(effectiveMode());

// Track OS changes live; only acts when in AUTO mode (no stored override).
const osMediaQuery = matchMedia("(prefers-color-scheme: dark)");
osMediaQuery.addEventListener("change", () => {
  if (storedOverride() === null) applyMode(systemMode());
});

themeBtn.addEventListener("click", () => {
  const { override, mode } = nextThemeState(currentMode(), systemMode());
  if (override === null) {
    localStorage.removeItem("vl-theme");
  } else {
    localStorage.setItem("vl-theme", override);
  }
  applyMode(mode);
});

// --- file models -------------------------------------------------------------
//
// One Monaco model per file, keyed by filename, with an `inmemory://` URI.
// Switching files is `editor.setModel(models[name])`; each model keeps its own
// cursor, scroll, and undo history. The first file is the (non-closable) entry
// module. On Monaco 0.52.2 `setModel` repaints fine — the prototype's
// `kickRender()` / `setModelLanguage` re-bind kludges (0.34.1 sandbox quirks)
// are not needed here.

type FileState = { name: string };
let files: FileState[] = [];
const models = new Map<string, monaco.editor.ITextModel>();
let activeFile = ENTRY_FILE;
let untitledSeq = 0;

const escapeHtml = (s: string): string =>
  s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c] ?? c));
const fmtMsg = (s: string): string =>
  escapeHtml(s).replace(/`([^`]+)`/g, "<code>$1</code>");

const modelUri = (name: string): monaco.Uri =>
  monaco.Uri.parse(`inmemory://vl/${name}`);

const disposeAllModels = () => {
  for (const m of models.values()) m.dispose();
  models.clear();
};

const makeModel = (name: string, source: string): monaco.editor.ITextModel => {
  const existing = monaco.editor.getModel(modelUri(name));
  if (existing) existing.dispose();
  const model = monaco.editor.createModel(source, VL_LANGUAGE_ID, modelUri(name));
  model.onDidChangeContent(() => onEdit());
  models.set(name, model);
  return model;
};

// --- per-file + whole-program diagnostics -----------------------------------
//
// Squiggles are PER FILE (the same single-file `lsp.diagnostics` path the
// playground always used, run independently on each model — diagnostics resolve
// to that file's own line/col). The Diagnostics pane AGGREGATES across files,
// each row labelled `mathx.vl [3:5]`; clicking switches file + jumps to the
// line. Whole-program compile (Run/WAT, via `runProject`) is a separate concern
// (it resolves the import graph to one module) — it is not what drives squiggles.

const SEVERITY: Record<VLDiagnostic["severity"], monaco.MarkerSeverity> = {
  error: monaco.MarkerSeverity.Error,
  warning: monaco.MarkerSeverity.Warning,
  info: monaco.MarkerSeverity.Info,
  hint: monaco.MarkerSeverity.Hint,
};

// A codegen/runtime diagnostic carries the sentinel 0:0–0:0 span (start == end);
// Monaco needs a non-empty range to render, so clamp it to the start of line 1.
const toMarker = (d: VLDiagnostic): monaco.editor.IMarkerData => {
  const { start, end } = d.range;
  const empty = start.line === end.line && start.character === end.character;
  const tags = d.tags?.includes("unnecessary")
    ? [monaco.MarkerTag.Unnecessary]
    : d.tags?.includes("deprecated")
    ? [monaco.MarkerTag.Deprecated]
    : undefined;
  return {
    severity: SEVERITY[d.severity],
    message: d.message,
    startLineNumber: start.line + 1,
    startColumn: start.character + 1,
    endLineNumber: end.line + 1,
    endColumn: empty ? start.character + 2 : end.character + 1,
    source: d.source,
    tags,
  };
};

const isLocationless = (d: VLDiagnostic): boolean => {
  const { start, end } = d.range;
  return start.line === 0 && start.character === 0 &&
    end.line === 0 && end.character === 0;
};

type AggregatedDiag = { file: string; diag: VLDiagnostic };

// The names a module `import`s — used to suppress single-file "undeclared X"
// errors for X resolved from another module (the single-file check can't see
// cross-module bindings; the whole-program `checkProject` catches genuinely
// unresolved imports instead). Mirrors the real LSP today, which is single-file.
const IMPORT_RE = /^\s*import\s*\{([^}]*)\}\s*from\b/gm;
const importedNames = (text: string): Set<string> => {
  const names = new Set<string>();
  for (const m of text.matchAll(IMPORT_RE)) {
    for (const part of m[1].split(",")) {
      // `a` or `a as b` → the LOCAL name (`a`, or `b` after `as`).
      const local = part.trim().split(/\s+as\s+/).pop()?.trim();
      if (local) names.add(local);
    }
  }
  return names;
};

const UNDECLARED_RE = /undeclared\s+(\w+)/;
const isImportedUndeclared = (d: VLDiagnostic, imported: Set<string>): boolean => {
  const m = UNDECLARED_RE.exec(d.message);
  return m !== null && imported.has(m[1]);
};

// Recompute per-file diagnostics, set Monaco markers on each model, and re-render
// the aggregated Diagnostics pane.
//
// Per file: the single-file `lsp.diagnostics` (synchronous, binaryen-free) — the
// same path the real (single-file) LSP runs — minus the spurious "undeclared
// <imported-name>" errors a single-file check can't resolve cross-module.
//
// For a multi-file project we ALSO run the whole-program `checkProject` (the
// graph-aware front end) and surface its import-resolution errors (bad path, name
// not exported, cycles) — locationless ones attach to the entry module. This is
// async, so a monotonic generation guard drops stale results from earlier edits.
let diagGen = 0;

const refreshDiagnostics = async (): Promise<void> => {
  const gen = ++diagGen;
  const multi = files.length > 1;
  const perFile = new Map<string, VLDiagnostic[]>();

  for (const f of files) {
    const model = models.get(f.name);
    if (!model) continue;
    const text = model.getValue();
    const imported = importedNames(text);
    const diags = lsp.diagnostics(text)
      .filter((d) => !isImportedUndeclared(d, imported));
    perFile.set(f.name, diags);
  }

  if (multi) {
    // Whole-program errors the single-file pass can't see (unresolved imports,
    // unexported names, cycles). Skip the ones already represented per file.
    try {
      const projectDiags = await checkProject(projectFiles(), ENTRY_FILE);
      if (gen !== diagGen) return; // a newer edit superseded this pass
      for (const d of projectDiags) {
        if (d.severity !== "error") continue;
        if (!/not exported|Cannot resolve import|Import cycle/.test(d.message)) {
          continue;
        }
        // These point at the importing module; attach to the entry (the file the
        // graph is rooted at) so they're always visible.
        let entryDiags = perFile.get(ENTRY_FILE);
        if (!entryDiags) perFile.set(ENTRY_FILE, entryDiags = []);
        entryDiags.push(d);
      }
    } catch {
      // Graph check is best-effort; per-file diagnostics already rendered below.
    }
  }
  if (gen !== diagGen) return;

  const all: AggregatedDiag[] = [];
  for (const f of files) {
    const model = models.get(f.name);
    if (!model) continue;
    const diags = perFile.get(f.name) ?? [];
    monaco.editor.setModelMarkers(model, VL_LANGUAGE_ID, diags.map(toMarker));
    for (const d of diags) all.push({ file: f.name, diag: d });
  }
  renderDiagnostics(all);
};

const SEVERITY_RANK: Record<VLDiagnostic["severity"], number> = {
  error: 0,
  warning: 1,
  info: 2,
  hint: 3,
};

const renderDiagnostics = (all: AggregatedDiag[]) => {
  const errors = all.filter((a) => a.diag.severity === "error").length;
  diagCount.textContent = String(all.length);
  diagCount.className = "count" +
    (errors > 0 ? " err" : all.length > 0 ? " info" : "");

  diagnosticsPane.replaceChildren();
  if (all.length === 0) {
    const ok = document.createElement("div");
    ok.className = "diag-empty";
    ok.textContent = "✓ No problems found";
    diagnosticsPane.append(ok);
    return;
  }
  const multi = files.length > 1;
  const sorted = [...all].sort(
    (a, b) => SEVERITY_RANK[a.diag.severity] - SEVERITY_RANK[b.diag.severity],
  );
  for (const { file, diag } of sorted) {
    const row = document.createElement("div");
    row.className = "diag";

    const sev = document.createElement("span");
    sev.className = `sev ${diag.severity}`;
    sev.textContent = diag.severity;
    row.append(sev);

    const line = diag.range.start.line + 1;
    const col = diag.range.start.character + 1;
    const loc = document.createElement("span");
    loc.className = "loc";
    loc.textContent = isLocationless(diag)
      ? (multi ? `${file}` : "")
      : `${multi ? file + " " : ""}[${line}:${col}]`;
    if (!isLocationless(diag) || multi) {
      loc.addEventListener("click", () => jumpTo(file, line, col));
    }
    row.append(loc);

    const msg = document.createElement("span");
    msg.className = "msg";
    msg.innerHTML = fmtMsg(diag.message);
    row.append(msg);

    diagnosticsPane.append(row);
  }
};

const jumpTo = (file: string, line: number, col: number) => {
  if (file !== activeFile) switchFile(file);
  editor.revealLineInCenter(line);
  editor.setPosition({ lineNumber: line, column: col });
  editor.focus();
};

// --- file tabs ---------------------------------------------------------------

const X_ICON =
  '<svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M4 4l8 8M12 4l-8 8"/></svg>';

const renderFileTabs = () => {
  ftabsEl.replaceChildren();
  files.forEach((f, i) => {
    const tab = document.createElement("button");
    tab.className = "ftab" + (f.name === activeFile ? " active" : "");
    tab.type = "button";

    const dot = document.createElement("span");
    dot.className = "fdot" + (i === 0 ? " entry" : "");
    if (i === 0) dot.title = "entry module";
    tab.append(dot);

    const nm = document.createElement("span");
    nm.className = "fname";
    nm.textContent = f.name;
    tab.append(nm);

    if (i !== 0) {
      const close = document.createElement("span");
      close.className = "fclose";
      close.title = "Close";
      close.innerHTML = X_ICON;
      close.addEventListener("click", (e) => {
        e.stopPropagation();
        closeFile(f.name);
      });
      tab.append(close);
    }

    tab.addEventListener("click", () => switchFile(f.name));
    ftabsEl.append(tab);
  });
};

const updateEditorMeta = () => {
  const model = models.get(activeFile);
  const lines = model ? model.getLineCount() : 0;
  const filePart = files.length > 1 ? `${files.length} files · ` : "";
  editorMeta.textContent = `VL · ${filePart}${lines} ${
    lines === 1 ? "line" : "lines"
  }`;
};

const switchFile = (name: string) => {
  const model = models.get(name);
  if (!model) return;
  activeFile = name;
  editor.setModel(model);
  renderFileTabs();
  updateEditorMeta();
  statusFile.textContent = name;
  const pos = editor.getPosition();
  setCursor(pos?.lineNumber ?? 1, pos?.column ?? 1);
};

const addFile = () => {
  const name = `untitled-${++untitledSeq}.vl`;
  files.push({ name });
  makeModel(name, "");
  switchFile(name);
  editor.focus();
  refreshDiagnostics();
};

const closeFile = (name: string) => {
  const idx = files.findIndex((f) => f.name === name);
  if (idx <= 0) return; // never close the entry module
  files.splice(idx, 1);
  models.get(name)?.dispose();
  models.delete(name);
  // Closing the active file falls back to the previous tab.
  if (activeFile === name) switchFile(files[Math.max(0, idx - 1)].name);
  else renderFileTabs();
  refreshDiagnostics();
  updateEditorMeta();
};

// --- results tabs ------------------------------------------------------------

const setTab = (name: string) => {
  for (const t of document.querySelectorAll<HTMLElement>(".tab")) {
    t.classList.toggle("active", t.dataset.pane === name);
  }
  for (const p of document.querySelectorAll<HTMLElement>(".pane")) {
    p.classList.toggle("active", p.dataset.pane === name);
  }
};
for (const t of document.querySelectorAll<HTMLElement>(".tab")) {
  t.addEventListener("click", () => setTab(t.dataset.pane ?? "out"));
}

// --- status bar --------------------------------------------------------------

type StatusKind = "info" | "busy" | "error";
const setStatus = (text: string, kind: StatusKind = "info") => {
  statusText.textContent = text;
  liveDot.classList.toggle("busy", kind === "busy");
  liveDot.classList.toggle("err", kind === "error");
};
const setCursor = (line: number, col: number) => {
  statusCursor.textContent = `Ln ${line}, Col ${col}`;
};

const fmtBytes = (n: number): string =>
  n < 1024 ? `${n} b` : `${(n / 1024).toFixed(2)} kb`;
const setSize = (bytes?: number) => {
  statusSize.textContent = bytes !== undefined ? `${fmtBytes(bytes)} wasm` : "—";
};

// --- output / WAT panes ------------------------------------------------------

const renderOutputEmpty = () => {
  logPane.innerHTML =
    `<div class="out-empty"><span class="big">Press Run to execute</span><span><kbd>⌘</kbd> <kbd>↵</kbd></span></div>`;
};

const renderWat = (wat: string | undefined, bytes: number | undefined) => {
  if (!wat) {
    watPane.innerHTML =
      `<div class="diag-empty">— no module: compilation failed —</div>`;
    watCount.textContent = "—";
    return;
  }
  const pre = document.createElement("pre");
  pre.className = "wat";
  pre.textContent = wat;
  watPane.replaceChildren(pre);
  watCount.textContent = bytes !== undefined ? fmtBytes(bytes) : "—";
};

// --- the project model -------------------------------------------------------
//
// `runProject` (whole-program compile → one wasm module). Run/WAT thread the
// entry module + the current contents of every file through it.

const projectFiles = (): Record<string, string> => {
  const out: Record<string, string> = {};
  for (const f of files) out[f.name] = models.get(f.name)?.getValue() ?? "";
  return out;
};

// --- last-session persistence ------------------------------------------------
//
// "Remember what we did last": persist the LIVE buffer(s) plus which sample they
// were based on, under a single localStorage key. A refresh/return restores the
// modified buffers (see the load precedence at the bottom of this file); SWITCHING
// to another sample loads it FRESH (discarding edits) and overwrites this record.

const persistSession = (): void => {
  saveLastSession({
    sampleIndex: activeSample,
    files: files.map((f) => ({
      name: f.name,
      source: models.get(f.name)?.getValue() ?? "",
    })),
  });
};

// --- run ---------------------------------------------------------------------
//
// EXECUTION NOTE (roadmap E3): user wasm runs on the MAIN THREAD here, so an
// autorun-triggered `while true {}` could hang the tab. Execution is therefore
// kept OPT-IN behind the auto-run toggle. The hardened path is to run the wasm in
// a Web Worker with a time/step budget and terminate on overrun — deferred to E3.
// (Diagnostics + WAT emit are pure analysis and always auto-run safely.)

let compilerReady = false;
let running = false;

const run = async () => {
  if (!compilerReady || running) return;
  if (autoTimer !== undefined) clearTimeout(autoTimer);
  running = true;
  runBtn.disabled = true;
  setStatus("Compiling…", "busy");
  setTab("out");
  logPane.replaceChildren();

  const nFiles = files.length;
  const fileSet = projectFiles();
  const startedAt = performance.now();
  try {
    const result = nFiles > 1
      ? await runProject(fileSet, ENTRY_FILE, { wat: true })
      : await runProgram(fileSet[ENTRY_FILE] ?? "", { wat: true });
    const elapsed = Math.max(1, Math.round(performance.now() - startedAt));

    // Whole-program diagnostics drive the run verdict; the per-file panel was
    // refreshed on edit, but re-render so codegen/runtime diagnostics show too.
    renderWat(result.wat, result.wasmBytes);
    setSize(result.wasmBytes);

    const errors = result.diagnostics.filter((d) => d.severity === "error");
    if (errors.length > 0) {
      logPane.innerHTML =
        `<div class="out-empty"><span class="big" style="color:var(--err)">Cannot run — ${errors.length} error${
          errors.length === 1 ? "" : "s"
        }</span><span>See the Diagnostics tab.</span></div>`;
      setStatus(
        `Failed — ${errors.length} error${errors.length === 1 ? "" : "s"}`,
        "error",
      );
      tabMeta.textContent = "";
      refreshDiagnostics();
      setTab("diag");
      return;
    }

    for (const ln of result.logs) {
      const div = document.createElement("div");
      div.className = "out-line";
      div.textContent = ln;
      logPane.append(div);
    }
    const foot = document.createElement("div");
    foot.className = "out-foot";
    const moduleNote = nFiles > 1 ? ` · ${nFiles} files → 1 module` : "";
    foot.innerHTML = `<span class="dot"></span>Ran successfully · ${result.logs.length} value${
      result.logs.length === 1 ? "" : "s"
    } printed${moduleNote}`;
    logPane.append(foot);
    if (result.logs.length === 0) {
      const empty = document.createElement("div");
      empty.className = "out-line";
      empty.textContent = "(no output)";
      logPane.insertBefore(empty, foot);
    }
    setStatus("Ran successfully", "info");
    tabMeta.textContent = `ran in ${elapsed}ms`;
    refreshDiagnostics();
  } catch (err) {
    setStatus(
      `Unexpected error: ${err instanceof Error ? err.message : String(err)}`,
      "error",
    );
  } finally {
    running = false;
    runBtn.disabled = false;
  }
};

runBtn.addEventListener("click", () => run());

// --- auto-run ----------------------------------------------------------------
//
// Two halves, per the README split:
//   - ALWAYS-ON, debounced (450ms) diagnostics + WAT emit — pure analysis,
//     safe, gives the "alive" feeling (`onEdit` below).
//   - EXECUTION — opt-in via the toggle (persisted). When on, edits also
//     schedule a debounced `run()`; the Run button relabels to "Run now".

let autoRun = localStorage.getItem("vl-autorun") === "1";
let autoTimer: ReturnType<typeof setTimeout> | undefined;
let diagTimer: ReturnType<typeof setTimeout> | undefined;
let hashTimer: ReturnType<typeof setTimeout> | undefined;
let sessionTimer: ReturnType<typeof setTimeout> | undefined;

const setAutoRun = (on: boolean) => {
  autoRun = on;
  localStorage.setItem("vl-autorun", on ? "1" : "0");
  autorunBtn.setAttribute("aria-checked", on ? "true" : "false");
  $<HTMLSpanElement>("run").querySelector<HTMLSpanElement>(".run-label")!
    .textContent = on ? "Run now" : "Run";
  if (on && compilerReady) run();
};
autorunBtn.setAttribute("aria-checked", autoRun ? "true" : "false");
$<HTMLSpanElement>("run").querySelector<HTMLSpanElement>(".run-label")!
  .textContent = autoRun ? "Run now" : "Run";
autorunBtn.addEventListener("click", () => setAutoRun(!autoRun));

// Fired on every model edit (any file). Always: debounced diagnostics + WAT,
// editor meta, the share-hash update. When auto-run execution is on: also a
// debounced `run()`, with `Editing…` shown during the debounce.
const onEdit = () => {
  updateEditorMeta();

  if (diagTimer !== undefined) clearTimeout(diagTimer);
  diagTimer = setTimeout(() => refreshDiagnostics(), 200);

  if (hashTimer !== undefined) clearTimeout(hashTimer);
  hashTimer = setTimeout(() => {
    encodeSource(models.get(ENTRY_FILE)?.getValue() ?? "").then((fragment) => {
      history.replaceState(null, "", fragment);
    }).catch(() => {/* hash update is best-effort */});
  }, 600);

  if (sessionTimer !== undefined) clearTimeout(sessionTimer);
  sessionTimer = setTimeout(() => persistSession(), 600);

  if (autoRun && compilerReady) {
    setStatus("Editing…", "busy");
    if (autoTimer !== undefined) clearTimeout(autoTimer);
    autoTimer = setTimeout(() => run(), 450);
  }
};

// --- sample picker -----------------------------------------------------------

const FILE_ICON =
  '<svg width="15" height="15" viewBox="0 0 16 16" fill="none"><path d="M4 2h5l3 3v9H4z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/><path d="M9 2v3h3" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/></svg>';
const FILES_ICON =
  '<svg width="15" height="15" viewBox="0 0 16 16" fill="none"><path d="M5 4h4l2.5 2.5V13H5z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/><path d="M3.5 2.5H7L9 4.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/><path d="M3 4v9" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>';

let activeSample = 0;

const buildMenu = () => {
  menuEl.replaceChildren();
  SAMPLES.forEach((s, i) => {
    const item = document.createElement("div");
    item.className = "menu-item" + (i === activeSample ? " sel" : "");
    const multi = s.files.length > 1;
    const lines = s.files.reduce((n, f) => n + f.source.split("\n").length, 0);
    const sub = multi ? `${s.files.length} files · ${lines} lines` : `${lines} lines`;
    item.innerHTML = `<span class="mi-ic">${multi ? FILES_ICON : FILE_ICON}</span>` +
      `<span class="mi-tx"><span class="mi-nm">${escapeHtml(s.name)}</span>` +
      `<span class="mi-sub">${sub}</span></span>`;
    item.addEventListener("click", () => {
      loadSample(i);
      closeMenu();
    });
    menuEl.append(item);
  });
};
const openMenu = () => {
  buildMenu();
  menuEl.classList.add("open");
};
const closeMenu = () => menuEl.classList.remove("open");

pickerBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  menuEl.classList.contains("open") ? closeMenu() : openMenu();
});
document.addEventListener("click", () => closeMenu());
menuEl.addEventListener("click", (e) => e.stopPropagation());

const loadSample = (i: number) => {
  const sample: Sample | undefined = SAMPLES[i];
  if (!sample) return;
  activeSample = i;
  pickerName.textContent = sample.name;
  disposeAllModels();
  untitledSeq = 0;
  files = sample.files.map((f) => ({ name: f.name }));
  for (const f of sample.files) makeModel(f.name, f.source);
  activeFile = files[0]?.name ?? ENTRY_FILE;
  editor.setModel(models.get(activeFile)!);
  renderFileTabs();
  updateEditorMeta();
  statusFile.textContent = activeFile;
  renderOutputEmpty();
  renderWat(undefined, undefined);
  setSize(undefined);
  tabMeta.textContent = "";
  setTab("out");
  refreshDiagnostics();
  setStatus("Ready");
  // Switching to a sample loads it FRESH (the previous edits are gone) and this
  // fresh sample becomes the new last session.
  persistSession();
  encodeSource(models.get(ENTRY_FILE)?.getValue() ?? "").then((fragment) => {
    history.replaceState(null, "", fragment);
  }).catch(() => {});
  if (autoRun && compilerReady) run();
};

// --- share / copy-link -------------------------------------------------------
//
// Encodes the ENTRY module's source into the URL hash (the share format is
// single-source today — E4), copies the full URL, and flashes a confirmation.

let shareResetTimer: ReturnType<typeof setTimeout> | undefined;
shareBtn.addEventListener("click", () => {
  encodeSource(models.get(ENTRY_FILE)?.getValue() ?? "").then(async (fragment) => {
    history.replaceState(null, "", fragment);
    try {
      await navigator.clipboard.writeText(location.href);
    } catch {
      // Clipboard API may be unavailable (non-HTTPS / blocked). The hash is
      // already in the address bar; the user can copy it manually.
    }
    const label = shareBtn.querySelector<HTMLSpanElement>(".share-label")!;
    label.textContent = "Copied!";
    setStatus("Link copied to clipboard");
    if (shareResetTimer !== undefined) clearTimeout(shareResetTimer);
    shareResetTimer = setTimeout(() => {
      label.textContent = "Share";
    }, 2000);
  }).catch(() => {/* encoding failure is silent */});
});

// --- format ------------------------------------------------------------------
//
// Wired to the REAL VL formatter (`compiler/format.ts`), applied to the active
// file's model in place (preserving cursor where possible).

let formatResetTimer: ReturnType<typeof setTimeout> | undefined;
formatBtn.addEventListener("click", () => {
  const model = models.get(activeFile);
  if (!model) return;
  try {
    const formatted = format(model.getValue());
    if (formatted !== model.getValue()) {
      editor.executeEdits("format", [{
        range: model.getFullModelRange(),
        text: formatted,
      }]);
      editor.pushUndoStop();
    }
    const label = formatBtn.querySelector<HTMLSpanElement>(".format-label")!;
    label.textContent = "Formatted";
    setStatus("Formatted");
    if (formatResetTimer !== undefined) clearTimeout(formatResetTimer);
    formatResetTimer = setTimeout(() => {
      label.textContent = "Format";
    }, 1500);
  } catch (err) {
    setStatus(
      `Format failed: ${err instanceof Error ? err.message : String(err)}`,
      "error",
    );
  }
});

faddBtn.addEventListener("click", () => addFile());

// --- initial buffers on load -------------------------------------------------
//
// Load precedence: URL share hash > last session > default sample 0.
//   - A share hash reproduces a link's source as the current buffer (entry only,
//     the share format is single-source) and becomes the new last session.
//   - Otherwise the last remembered session restores the modified buffers into
//     the sample context they were based on, so a refresh/return keeps your edits.
//   - Failing both, the default sample 0 loads fresh.
const sourceFromHash = await decodeHash(location.hash).catch(() => null);
const lastSession = sourceFromHash ? null : loadLastSession();

// --- editor instance ---------------------------------------------------------

// Resolve the sample context (which built-in the buffers belong to) and the
// initial per-file sources, applying the precedence above.
const baseSample = SAMPLES[lastSession?.sampleIndex ?? 0] ?? SAMPLES[0]!;
activeSample = lastSession?.sampleIndex ?? 0;
if (!SAMPLES[activeSample]) activeSample = 0;

if (lastSession) {
  files = lastSession.files.map((f) => ({ name: f.name }));
  for (const f of lastSession.files) makeModel(f.name, f.source);
} else {
  files = baseSample.files.map((f) => ({ name: f.name }));
  for (const f of baseSample.files) {
    makeModel(
      f.name,
      f.name === ENTRY_FILE && sourceFromHash ? sourceFromHash : f.source,
    );
  }
}
activeFile = ENTRY_FILE;
pickerName.textContent = SAMPLES[activeSample]!.name;

// Persist whatever we loaded so the current buffers are the remembered session
// (a shared link or a fresh default becomes the new last session).
persistSession();

const editor = monaco.editor.create(editorHost, {
  model: models.get(ENTRY_FILE)!,
  theme: currentMode() === "dark" ? "vital-dark" : "vital-light",
  automaticLayout: true,
  fontFamily: "Geist Mono, ui-monospace, monospace",
  fontSize: 13.5,
  lineHeight: 21,
  tabSize: 2,
  minimap: { enabled: false },
  renderLineHighlight: "line",
  bracketPairColorization: { enabled: false },
  inlayHints: { enabled: "on", fontSize: 11 },
  "semanticHighlighting.enabled": true,
  scrollBeyondLastLine: false,
  padding: { top: 14, bottom: 14 },
  lineNumbersMinChars: 3,
  glyphMargin: false,
  folding: false,
  overviewRulerLanes: 0,
  smoothScrolling: true,
  cursorBlinking: "smooth",
  scrollbar: { verticalScrollbarSize: 10, horizontalScrollbarSize: 10 },
  contextmenu: false,
});

// Monaco measures and CACHES the monospace glyph width at creation time. The
// editor font (Geist Mono) is a Google web font loaded with `display=swap`, so
// at creation the browser is still painting the FALLBACK face — Monaco captures
// the fallback's char width, and once Geist Mono swaps in the glyphs no longer
// line up with the cached metric, drifting the caret and selection box (visible
// as the cursor sitting off from the text). Remeasure once the real face has
// actually loaded so Monaco's metrics match what's painted. `remeasureFonts` is
// idempotent, so firing on both the explicit face load and `fonts.ready` is safe.
if (document.fonts) {
  Promise.all([
    document.fonts.load('400 14px "Geist Mono"'),
    document.fonts.load('500 14px "Geist Mono"'),
  ]).then(() => monaco.editor.remeasureFonts()).catch(() => {});
  document.fonts.ready.then(() => monaco.editor.remeasureFonts());
}

editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => run());
editor.onDidChangeCursorPosition((e) => {
  statusFile.textContent = activeFile;
  setCursor(e.position.lineNumber, e.position.column);
});

veil.hidden = true;
renderFileTabs();
updateEditorMeta();
statusFile.textContent = activeFile;
setCursor(1, 1);
renderOutputEmpty();
renderWat(undefined, undefined);

// --- compiler readiness ------------------------------------------------------
//
// Reaching here means binaryen's TLA didn't throw during instantiation. Do a
// tiny warm-up compile to confirm codegen instantiates before enabling Run, then
// run the first diagnostics pass over the seeded files.

setStatus("Loading compiler…", "busy");
runBtn.disabled = true;
(async () => {
  try {
    await runProgram("print(1)");
    compilerReady = true;
    runBtn.disabled = false;
    refreshDiagnostics();
    setStatus("Ready");
    if (autoRun) run();
  } catch (err) {
    setStatus(
      "Compiler failed to load (binaryen could not instantiate in this " +
        `browser): ${err instanceof Error ? err.message : String(err)}`,
      "error",
    );
  }
})();
