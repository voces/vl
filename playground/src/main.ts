/// <reference lib="dom" />
/// <reference lib="dom.iterable" />
// Wires the DOM to the compiler. Bundled into dist/playground.js by build.ts.
//
// Loading binaryen runs a top-level await inside the bundle, so the module's
// import graph (this file -> playground.ts -> compile.ts -> toWasm.ts ->
// binaryen) only finishes evaluating once the wasm toolchain is instantiated.
// We surface that with a "loading compiler…" state and a clear error if it
// throws — that being the headline integration risk for client-side binaryen.

import { runProgram, type VLDiagnostic } from "./playground.ts";
import { SAMPLES } from "./samples.ts";

const $ = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`missing #${id}`);
  return el as T;
};

const editor = $<HTMLTextAreaElement>("editor");
const runBtn = $<HTMLButtonElement>("run");
const sampleSelect = $<HTMLSelectElement>("samples");
const watToggle = $<HTMLInputElement>("wat-toggle");
const status = $<HTMLDivElement>("status");
const diagnosticsPane = $<HTMLDivElement>("diagnostics");
const logPane = $<HTMLPreElement>("log");
const watPane = $<HTMLPreElement>("wat");
const watSection = $<HTMLDivElement>("wat-section");

// --- sample picker --------------------------------------------------------

for (const [i, s] of SAMPLES.entries()) {
  const opt = document.createElement("option");
  opt.value = String(i);
  opt.textContent = s.name;
  sampleSelect.append(opt);
}
const loadSample = (i: number) => {
  editor.value = SAMPLES[i]?.source ?? "";
};
sampleSelect.addEventListener("change", () => {
  loadSample(Number(sampleSelect.value));
});
loadSample(0); // seed the editor on first paint

// --- rendering ------------------------------------------------------------

const SEVERITY_RANK: Record<VLDiagnostic["severity"], number> = {
  error: 0,
  warning: 1,
  info: 2,
};

// A codegen/runtime diagnostic carries the sentinel 0:0–0:0 span (start == end);
// don't show a misleading 1:1 locator for those (mirrors cli.ts isLocationless).
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

// --- run ------------------------------------------------------------------

let compilerReady = false;

const run = async () => {
  if (!compilerReady) return;
  runBtn.disabled = true;
  setStatus("Compiling…", "busy");
  logPane.textContent = "";
  watPane.textContent = "";
  watSection.hidden = !watToggle.checked;
  try {
    const result = await runProgram(editor.value, { wat: watToggle.checked });
    renderDiagnostics(result.diagnostics);
    logPane.textContent = result.logs.length
      ? result.logs.join("\n")
      : result.compiled
      ? "(no output)"
      : "";
    if (watToggle.checked) watPane.textContent = result.wat ?? "(no module)";
    const errors = result.diagnostics.filter((d) =>
      d.severity === "error"
    ).length;
    setStatus(
      errors > 0
        ? `Found ${errors} error${errors === 1 ? "" : "s"}.`
        : result.compiled
        ? "Ran successfully."
        : "Done.",
      errors > 0 ? "error" : "info",
    );
  } catch (err) {
    // Defensive: runProgram is designed not to throw, but a bug shouldn't leave
    // the UI stuck on "Compiling…".
    setStatus(
      `Unexpected error: ${err instanceof Error ? err.message : String(err)}`,
      "error",
    );
  } finally {
    runBtn.disabled = false;
  }
};

runBtn.addEventListener("click", run);
// Ctrl/Cmd+Enter to run, the usual playground shortcut.
editor.addEventListener("keydown", (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
    e.preventDefault();
    run();
  }
});
watToggle.addEventListener("change", () => {
  watSection.hidden = !watToggle.checked;
});

// --- compiler readiness ---------------------------------------------------
//
// The compiler (and binaryen) finished loading by the time this module's imports
// resolved. If binaryen's TLA had thrown during instantiation, this module would
// never have run at all — so reaching here means client-side binaryen worked.
// We do a tiny warm-up compile to confirm codegen actually instantiates before
// enabling the button, and report a clear error if it doesn't.

setStatus("Loading compiler…", "busy");
runBtn.disabled = true;
(async () => {
  try {
    // A trivial program that exercises the full binaryen codegen path.
    await runProgram("print(1)");
    compilerReady = true;
    runBtn.disabled = false;
    setStatus("Ready. Press Run (or Ctrl/Cmd+Enter).");
  } catch (err) {
    setStatus(
      "Compiler failed to load (binaryen could not instantiate in this " +
        `browser): ${err instanceof Error ? err.message : String(err)}`,
      "error",
    );
  }
})();
