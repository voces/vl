// Regression test: keep the web Playground in sync with the VS Code LSP.
//
// WHY THIS EXISTS
// ---------------
// Every language feature is one function in `lsp/src/features.ts`. Two thin
// transports call them:
//   - `lsp/src/server.ts`        — the VS Code LSP (registers `onHover`,
//     `onCodeAction`, … and declares server capabilities).
//   - `playground/src/lspAdapter.ts` (+ `main.ts`) — the browser playground
//     (one binding per feature + a matching Monaco provider).
//
// Two drifts are possible. The WIRING one: `main.ts` independently decides which
// Monaco providers to register, which is what once left the playground's "Auto
// Fix" missing while the LSP had it. And the LOGIC one: a host composing a
// feature itself instead of calling the shared function, which is how the
// playground went months without UFCS completions under a green "completion" row.
//
// WHAT THIS TEST ASSERTS
// ----------------------
// For every language feature the LSP exposes (enumerated FROM `server.ts` — each
// row's `serverMarker` is verified present, so the table cannot drift away from
// the real LSP surface):
//   (a) `playground/src/lspAdapter.ts` exports the corresponding binding
//       (imported here; checked with `typeof === "function"`),
//   (b) `playground/src/main.ts` wires the corresponding Monaco provider (its
//       `mainMarker` string is present in `main.ts`'s source), and
//   (c) both `server.ts` and `lspAdapter.ts` CALL the row's `shared` function from
//       `features.ts`, so the two hosts compute the feature the same way.
//
// ADDING AN LSP FEATURE ⇒ ADDING PLAYGROUND WIRING. Put the logic in
// `features.ts`, call it from both hosts, and add a row below.
//
// `main.ts` is NOT imported (it imports `monaco-editor`, which can't be loaded
// in Deno); we assert against its SOURCE TEXT instead. `lspAdapter.ts` is
// Monaco-free and IS imported for real `typeof` checks. `server.ts` lives under
// the deno-excluded `lsp/` tree, so it too is read as source text.
//
// Run with:
//   deno test -A --no-check tests/playground_lsp_parity_test.ts

import * as adapter from "../playground/src/lspAdapter.ts";

// Hand-rolled asserts (repo convention — no std import map).
const assert = (cond: boolean, msg: string): void => {
  if (!cond) throw new Error(msg);
};

// Paths are relative to this test file's directory so the test is CWD-agnostic.
const here = new URL(".", import.meta.url);
const read = (rel: string): string => Deno.readTextFileSync(new URL(rel, here));

const serverSrc = read("../lsp/src/server.ts");
const featuresSrc = read("../lsp/src/features.ts");
const adapterSrc = read("../playground/src/lspAdapter.ts");
const mainSrc = read("../playground/src/main.ts");

// --- the feature parity table -----------------------------------------------
//
// One row per language feature the LSP exposes:
//   - `feature`       human name (used in failure messages).
//   - `serverMarker`  a substring that MUST appear in `server.ts`.
//   - `adapterExport` the `lspAdapter.ts` export expected for this feature.
//   - `mainMarker`    a substring that MUST appear in `main.ts` — the Monaco
//                     `register…Provider` / capability call that wires it.
//   - `shared`        the `features.ts` export both hosts call, or null when the
//                     feature has none (diagnostics: each host runs the checker).
//   - `knownGap`      OPTIONAL. The LSP exposes the feature and the playground
//                     does not wire it; the test asserts the gap STILL HOLDS, so
//                     closing it reds this row until it is promoted.
type Parity = {
  feature: string;
  serverMarker: string;
  adapterExport: string;
  mainMarker: string;
  shared: string | null;
  knownGap?: string;
};

const FEATURES: Parity[] = [
  {
    feature: "diagnostics",
    serverMarker: "documents.onDidChangeContent",
    adapterExport: "diagnostics",
    // Diagnostics are pushed as Monaco markers, not a register…Provider call.
    mainMarker: "monaco.editor.setModelMarkers",
    shared: null,
  },
  {
    feature: "semantic tokens",
    serverMarker: "connection.languages.semanticTokens.on",
    adapterExport: "semanticTokens",
    mainMarker: "registerDocumentSemanticTokensProvider",
    shared: "semanticTokensAt",
  },
  {
    feature: "hover",
    serverMarker: "connection.onHover",
    adapterExport: "hover",
    mainMarker: "registerHoverProvider",
    shared: "hoverAt",
  },
  {
    feature: "inlay hints",
    serverMarker: "connection.languages.inlayHint.on",
    adapterExport: "inlayHints",
    mainMarker: "registerInlayHintsProvider",
    shared: "inlayHintsAt",
  },
  {
    feature: "go-to-definition",
    serverMarker: "connection.onDefinition",
    adapterExport: "definition",
    mainMarker: "registerDefinitionProvider",
    shared: "definitionAt",
  },
  {
    feature: "find references",
    serverMarker: "connection.onReferences",
    adapterExport: "references",
    mainMarker: "registerReferenceProvider",
    shared: "referencesAt",
  },
  {
    feature: "document highlights",
    serverMarker: "connection.onDocumentHighlight",
    adapterExport: "documentHighlights",
    mainMarker: "registerDocumentHighlightProvider",
    shared: "documentHighlightsAt",
  },
  {
    feature: "document symbols (outline)",
    serverMarker: "connection.onDocumentSymbol",
    adapterExport: "documentSymbols",
    mainMarker: "registerDocumentSymbolProvider",
    shared: "documentSymbolsAt",
  },
  {
    // `resolveRenameLocation` is the prepare half, which is why
    // `connection.onPrepareRename` sits in NON_FEATURE below.
    feature: "rename symbol",
    serverMarker: "connection.onRenameRequest",
    adapterExport: "rename",
    mainMarker: "registerRenameProvider",
    shared: "renameAt",
  },
  {
    // The playground formats from its toolbar button, not a Monaco provider.
    feature: "document formatting",
    serverMarker: "connection.onDocumentFormatting",
    adapterExport: "format",
    mainMarker: "format(model.getValue())",
    shared: "formattingEditsAt",
  },
  {
    feature: "code actions (quick-fix / organize imports)",
    serverMarker: "connection.onCodeAction",
    adapterExport: "codeActions",
    mainMarker: "registerCodeActionProvider",
    shared: "codeActionsAt",
  },
  {
    feature: "completion",
    serverMarker: "connection.onCompletion",
    adapterExport: "completion",
    mainMarker: "registerCompletionItemProvider",
    shared: "completionsAt",
  },
  {
    feature: "folding ranges",
    serverMarker: "connection.onFoldingRanges",
    adapterExport: "foldingRanges",
    mainMarker: "registerFoldingRangeProvider",
    shared: "foldingRangesAt",
  },
  {
    feature: "signature help",
    serverMarker: "connection.onSignatureHelp",
    adapterExport: "signatureHelp",
    mainMarker: "registerSignatureHelpProvider",
    shared: "signatureHelpAt",
  },

  // ---- KNOWN PARITY GAPS (LSP exposes it; playground does NOT wire it) -------
  {
    // A gap by design: the lens counts read the workspace-wide use-map the
    // server's save pass maintains, and the playground keeps no such map.
    feature: "code lens (export reference counts)",
    serverMarker: "connection.onCodeLens",
    adapterExport: "codeLenses",
    mainMarker: "registerCodeLensProvider",
    shared: "codeLensesAt",
    knownGap: "workspace-scoped (lastUseMap); the playground keeps no use-map",
  },
];

// --- 0. the table self-validates against server.ts --------------------------

Deno.test("parity table matches the live LSP surface (server.ts)", () => {
  for (const f of FEATURES) {
    assert(
      serverSrc.includes(f.serverMarker),
      `feature "${f.feature}": server.ts no longer contains "${f.serverMarker}" — ` +
        `the LSP handler was renamed/removed, or the parity row is stale.`,
    );
  }
});

// A new `server.ts` handler nobody added a row for is the reverse drift.
Deno.test("every server.ts handler has a parity-table row", () => {
  const handlerRe =
    /connection\.(?:on[A-Z]\w*|languages\.\w+\.on)|documents\.onDidChangeContent/g;
  const found = new Set(serverSrc.match(handlerRe) ?? []);
  // Handlers that are NOT user-facing language features.
  const NON_FEATURE = new Set([
    "connection.onInitialize",
    "connection.onInitialized", // lifecycle: flushes the cached seed-origin notification
    "connection.onCodeLensResolve", // the resolve half of the code-lens row above
    "connection.onPrepareRename", // the prepare half of the rename row above
    "documents.onDidSave", // save-triggered workspace pass; not a Monaco provider
  ]);
  for (const handler of found) {
    if (NON_FEATURE.has(handler)) continue;
    assert(
      FEATURES.some((f) => f.serverMarker.startsWith(handler)),
      `server.ts registers "${handler}" but no parity-table row covers it. ` +
        `Add a row to FEATURES (and wire the playground), or add it to ` +
        `NON_FEATURE if it isn't a user-facing language feature.`,
    );
  }
});

// --- 1. both hosts call the same shared feature -------------------------------

Deno.test("both hosts call the row's shared features.ts function", () => {
  for (const f of FEATURES) {
    if (f.shared === null) continue;
    const call = `${f.shared}(`;
    assert(
      featuresSrc.includes(`export const ${f.shared} =`),
      `feature "${f.feature}": features.ts no longer exports "${f.shared}".`,
    );
    assert(
      serverSrc.includes(call),
      `feature "${f.feature}": server.ts does not call "${f.shared}".`,
    );
    if (f.knownGap) continue;
    assert(
      adapterSrc.includes(call),
      `feature "${f.feature}": the playground adapter does not call "${f.shared}", ` +
        `so it computes the feature its own way. Call the shared function from ` +
        `playground/src/lspAdapter.ts.`,
    );
  }
});

// --- 2. adapter export present (real import + typeof) -----------------------

Deno.test("lspAdapter.ts exports a binding for each in-parity feature", () => {
  const exports = adapter as unknown as Record<string, unknown>;
  for (const f of FEATURES) {
    const present = typeof exports[f.adapterExport] === "function";
    if (f.knownGap) {
      assert(
        !(present && mainSrc.includes(f.mainMarker)),
        `KNOWN GAP CLOSED: "${f.feature}" is now fully wired (adapter export ` +
          `"${f.adapterExport}" + main.ts "${f.mainMarker}"). Delete its \`knownGap\`.`,
      );
      continue;
    }
    assert(
      present,
      `MISSING ADAPTER BINDING: lspAdapter.ts must export a "${f.adapterExport}" ` +
        `function for feature "${f.feature}".`,
    );
  }
});

// --- 3. main.ts wires the Monaco provider for each in-parity feature ---------

Deno.test("main.ts registers a Monaco provider for each in-parity feature", () => {
  for (const f of FEATURES) {
    const present = mainSrc.includes(f.mainMarker);
    if (f.knownGap) {
      assert(
        !present,
        `KNOWN GAP CLOSED: main.ts now contains "${f.mainMarker}" for ` +
          `"${f.feature}". Delete its \`knownGap\`.`,
      );
      continue;
    }
    assert(
      present,
      `MISSING PLAYGROUND WIRING: main.ts must wire "${f.mainMarker}" for ` +
        `feature "${f.feature}". Register it in playground/src/main.ts.`,
    );
  }
});

// --- 4. surface the known gaps (informational) ------------------------------

Deno.test("DOCUMENTED parity gaps (informational)", () => {
  for (const g of FEATURES.filter((f) => f.knownGap)) {
    console.log(`  parity gap — ${g.feature}: ${g.knownGap}`);
  }
});
