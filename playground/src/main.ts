/// <reference lib="dom" />
/// <reference lib="dom.iterable" />
// Wires the Monaco editor + the client-side "language server" to the DOM.
// Bundled into dist/playground.js by build.ts.
//
// VL's language server runs IN THE BROWSER: the compiler and the LSP
// feature-helpers are pure TS, so the same logic `lsp/src/server.ts` runs per
// request runs here on the current Monaco model. `lspAdapter.ts` is the bridge
// (pure, Monaco-free); this file maps its results onto Monaco's provider APIs:
//   - diagnostics  → `monaco.editor.setModelMarkers` (debounced on edit)
//   - semantic tokens → a `DocumentSemanticTokensProvider`
//   - hover        → a `HoverProvider`
//   - inlay hints  → an `InlayHintsProvider` (stretch / D6)
//   - definition   → a `DefinitionProvider` (stretch / D2)
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
// main thread; this is a deliberate deferral, not a missing feature (see PR).

import * as monaco from "monaco-editor";
import { runProgram, type VLDiagnostic } from "./playground.ts";
import { SAMPLES } from "./samples.ts";
import * as lsp from "./lspAdapter.ts";

const VL_LANGUAGE_ID = "vital";

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
const sampleSelect = $<HTMLSelectElement>("samples");
const watToggle = $<HTMLInputElement>("wat-toggle");
const status = $<HTMLDivElement>("status");
const diagnosticsPane = $<HTMLDivElement>("diagnostics");
const logPane = $<HTMLPreElement>("log");
const watPane = $<HTMLPreElement>("wat");
const watSection = $<HTMLDivElement>("wat-section");

// --- language registration --------------------------------------------------

monaco.languages.register({ id: VL_LANGUAGE_ID, aliases: ["VL", "Vital"] });

// A minimal Monarch grammar as a fallback for strings/comments/numbers — the
// semantic-token provider does the accurate identifier/member colouring, but
// Monarch runs first and synchronously, so strings and comments are coloured
// even before semantic tokens resolve (and inside an erroring document).
monaco.languages.setMonarchTokensProvider(VL_LANGUAGE_ID, {
  defaultToken: "",
  keywords: [
    "fn", "if", "then", "else", "elseif", "while", "for", "to", "step", "in",
    "const", "let", "return", "is", "await", "break", "continue", "from",
    "type", "true", "false", "null",
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
  ],
});

// --- theme ------------------------------------------------------------------
//
// A dark theme that maps the VL semantic-token types to VS-Code-ish colours.
// Monaco semantic-token rules are keyed by the legend's token-type names.
monaco.editor.defineTheme("vital-dark", {
  base: "vs-dark",
  inherit: true,
  rules: [
    { token: "comment", foreground: "6a9955" },
    { token: "string", foreground: "ce9178" },
    { token: "number", foreground: "b5cea8" },
    { token: "keyword", foreground: "569cd6" },
    { token: "operator", foreground: "d4d4d4" },
    { token: "variable", foreground: "9cdcfe" },
    { token: "parameter", foreground: "9cdcfe" },
    { token: "function", foreground: "dcdcaa" },
    { token: "method", foreground: "dcdcaa" },
    { token: "type", foreground: "4ec9b0" },
    { token: "boolean", foreground: "569cd6" },
    { token: "property", foreground: "9cdcfe" },
  ],
  colors: { "editor.background": "#1e1e1e" },
});

// --- semantic tokens provider (must-have / D5) ------------------------------
//
// Convert the pure legend (`SEMANTIC_TOKEN_LEGEND`) into Monaco's form and back
// the provider with the same delta-encoded `data` the LSP returns. The encoding
// is identical, so no remapping of the stream is needed.
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

// --- hover provider (must-have / D1) ----------------------------------------

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

// --- inlay hints provider (stretch / D6) ------------------------------------

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

// --- definition provider (stretch / D2) -------------------------------------

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

// --- editor instance --------------------------------------------------------

const model = monaco.editor.createModel(SAMPLES[0]?.source ?? "", VL_LANGUAGE_ID);
const editor = monaco.editor.create(editorHost, {
  model,
  theme: "vital-dark",
  automaticLayout: true,
  minimap: { enabled: false },
  fontSize: 13,
  tabSize: 2,
  "semanticHighlighting.enabled": true,
  scrollBeyondLastLine: false,
});

// --- diagnostics (must-have): edit → markers --------------------------------
//
// On every (debounced) content change, run the binaryen-free front end and map
// each VLDiagnostic to a Monaco marker. `setModelMarkers` replaces the marker
// set wholesale, so stale squiggles clear automatically.

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
    // Widen an empty span by one so it's visible; otherwise carry the real end.
    endColumn: empty ? start.character + 2 : end.character + 1,
    source: d.source,
    tags,
  };
};

const refreshDiagnostics = () => {
  const text = model.getValue();
  const diags = lsp.diagnostics(text);
  monaco.editor.setModelMarkers(model, VL_LANGUAGE_ID, diags.map(toMarker));
  renderDiagnostics(diags);
};

let debounce: ReturnType<typeof setTimeout> | undefined;
model.onDidChangeContent(() => {
  if (debounce !== undefined) clearTimeout(debounce);
  debounce = setTimeout(refreshDiagnostics, 200);
});

// --- sample picker ----------------------------------------------------------

sampleSelect.addEventListener("change", () => {
  const i = Number(sampleSelect.value);
  model.setValue(SAMPLES[i]?.source ?? "");
});

// --- diagnostics pane rendering ---------------------------------------------

const SEVERITY_RANK: Record<VLDiagnostic["severity"], number> = {
  error: 0,
  warning: 1,
  info: 2,
  hint: 3,
};

const isLocationless = (d: VLDiagnostic): boolean => {
  const { start, end } = d.range;
  return start.line === 0 && start.character === 0 &&
    end.line === 0 && end.character === 0;
};

const renderDiagnostics = (diags: VLDiagnostic[]) => {
  diagnosticsPane.replaceChildren();
  if (diags.length === 0) {
    const ok = document.createElement("div");
    ok.className = "diag ok";
    ok.textContent = "No diagnostics.";
    diagnosticsPane.append(ok);
    return;
  }
  const sorted = [...diags].sort(
    (a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity],
  );
  for (const d of sorted) {
    const row = document.createElement("div");
    row.className = `diag ${d.severity}`;
    const loc = isLocationless(d)
      ? ""
      : ` [${d.range.start.line + 1}:${d.range.start.character + 1}]`;
    row.textContent = `${d.severity}${loc} ${d.message}`;
    diagnosticsPane.append(row);
  }
};

const setStatus = (text: string, kind: "info" | "busy" | "error" = "info") => {
  status.textContent = text;
  status.dataset.kind = kind;
};

// --- run --------------------------------------------------------------------

let compilerReady = false;

const run = async () => {
  if (!compilerReady) return;
  runBtn.disabled = true;
  setStatus("Compiling…", "busy");
  logPane.textContent = "";
  watPane.textContent = "";
  watSection.hidden = !watToggle.checked;
  try {
    const result = await runProgram(model.getValue(), { wat: watToggle.checked });
    renderDiagnostics(result.diagnostics);
    logPane.textContent = result.logs.length
      ? result.logs.join("\n")
      : result.compiled
      ? "(no output)"
      : "";
    if (watToggle.checked) watPane.textContent = result.wat ?? "(no module)";
    const errors = result.diagnostics.filter((d) => d.severity === "error").length;
    setStatus(
      errors > 0
        ? `Found ${errors} error${errors === 1 ? "" : "s"}.`
        : result.compiled
        ? "Ran successfully."
        : "Done.",
      errors > 0 ? "error" : "info",
    );
  } catch (err) {
    setStatus(
      `Unexpected error: ${err instanceof Error ? err.message : String(err)}`,
      "error",
    );
  } finally {
    runBtn.disabled = false;
  }
};

runBtn.addEventListener("click", run);
editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => run());
watToggle.addEventListener("change", () => {
  watSection.hidden = !watToggle.checked;
});

// --- compiler readiness -----------------------------------------------------
//
// Reaching here means binaryen's TLA didn't throw during instantiation. We do a
// tiny warm-up compile to confirm codegen instantiates before enabling Run, then
// run the first diagnostics pass over the seeded sample.

setStatus("Loading compiler…", "busy");
runBtn.disabled = true;
(async () => {
  try {
    await runProgram("print(1)");
    compilerReady = true;
    runBtn.disabled = false;
    refreshDiagnostics();
    setStatus("Ready. Press Run (or Ctrl/Cmd+Enter).");
  } catch (err) {
    setStatus(
      "Compiler failed to load (binaryen could not instantiate in this " +
        `browser): ${err instanceof Error ? err.message : String(err)}`,
      "error",
    );
  }
})();
