// Regression test: keep the web Playground in sync with the VS Code LSP.
//
// WHY THIS EXISTS
// ---------------
// VL's language-feature LOGIC lives in pure, framework-free helpers
// (`compiler/*` + `lsp/src/*`). Two thin adapters consume them:
//   - `lsp/src/server.ts`        — the VS Code LSP (registers `onHover`,
//     `onCodeAction`, … and declares server capabilities).
//   - `playground/src/lspAdapter.ts` (+ `main.ts`) — the browser playground
//     (one pure binding per feature + a matching Monaco provider).
//
// The DRIFT RISK is the WIRING: `main.ts` independently decides which Monaco
// providers to register, and that list can silently fall behind `server.ts`.
// This is exactly what left the playground's "Auto Fix" quietly missing: the
// LSP gained `onCodeAction` (and the adapter gained a `codeActions` binding),
// but `main.ts` never registered a Monaco `CodeActionProvider`.
//
// WHAT THIS TEST ASSERTS
// ----------------------
// For every language feature the LSP exposes (enumerated FROM `server.ts` — the
// `serverMarker` of each row is verified to actually be present in `server.ts`,
// so the table can't drift away from the real LSP surface):
//   (a) `playground/src/lspAdapter.ts` exports the corresponding pure binding
//       (imported here; checked with `typeof === "function"`), AND
//   (b) `playground/src/main.ts` wires the corresponding Monaco provider /
//       capability (its `mainMarker` string is present in `main.ts`'s source).
//
// ADDING AN LSP FEATURE ⇒ ADDING PLAYGROUND WIRING. If you add a handler to
// `server.ts`, add a row below, AND wire both the `lspAdapter.ts` export and the
// `main.ts` Monaco provider — otherwise this test fails and names the gap. The
// value is the forced awareness: a maintained table that breaks the build on
// drift.
//
// `main.ts` is NOT imported (it imports `monaco-editor`, which can't be loaded
// in Deno); we assert against its SOURCE TEXT instead. `lspAdapter.ts` is pure
// (no Monaco) and IS imported for real `typeof` checks. `server.ts` lives under
// the deno-excluded `lsp/` tree, so it too is read as source text.
//
// Run with:
//   deno test -A --no-check tests/playground_lsp_parity_test.ts

import * as adapter from "../playground/src/lspAdapter.ts";

// Hand-rolled asserts (repo convention — no std import map).
const assert = (cond: boolean, msg: string): void => {
  if (!cond) throw new Error(msg);
};

// --- read the LSP + playground sources as text ------------------------------
//
// Paths are relative to this test file's directory so the test is CWD-agnostic.
const here = new URL(".", import.meta.url);
const read = (rel: string): string =>
  Deno.readTextFileSync(new URL(rel, here));

const serverSrc = read("../lsp/src/server.ts");
const mainSrc = read("../playground/src/main.ts");

// --- the feature parity table -----------------------------------------------
//
// One row per language feature the LSP exposes. Each row carries:
//   - `feature`       human name (used in failure messages).
//   - `serverMarker`  a substring that MUST appear in `server.ts` — proves the
//                     LSP really exposes this feature (the table self-validates
//                     against the live LSP surface; a renamed/removed handler
//                     surfaces here).
//   - `adapterExport` the `lspAdapter.ts` export expected for this feature, or
//                     `null` when the playground wires it WITHOUT a dedicated
//                     adapter binding (e.g. formatting calls `compiler/format.ts`
//                     straight from a toolbar button).
//   - `mainMarker`    a substring that MUST appear in `main.ts` — the Monaco
//                     `register…Provider` / capability call that wires it.
//   - `knownGap`      OPTIONAL. When set, this feature is a DOCUMENTED parity
//                     gap: the LSP exposes it but the playground does not yet
//                     wire it. The test then asserts the gap STILL EXISTS — so
//                     when someone closes the gap (adds the export / provider)
//                     this row fails and forces them to delete the TODO and turn
//                     the row into a real parity assertion. The string is the
//                     reason, surfaced in output.
type Parity = {
  feature: string;
  serverMarker: string;
  adapterExport: string | null;
  mainMarker: string | null;
  knownGap?: string;
};

const FEATURES: Parity[] = [
  // ---- IN PARITY (LSP + adapter export + Monaco provider all present) -------
  {
    feature: "diagnostics",
    serverMarker: "documents.onDidChangeContent",
    adapterExport: "diagnostics",
    // Diagnostics are pushed as Monaco markers, not a register…Provider call.
    mainMarker: "monaco.editor.setModelMarkers",
  },
  {
    feature: "semantic tokens",
    serverMarker: "connection.languages.semanticTokens.on",
    adapterExport: "semanticTokens",
    mainMarker: "registerDocumentSemanticTokensProvider",
  },
  {
    feature: "hover",
    serverMarker: "connection.onHover",
    adapterExport: "hover",
    mainMarker: "registerHoverProvider",
  },
  {
    feature: "inlay hints",
    serverMarker: "connection.languages.inlayHint.on",
    adapterExport: "inlayHints",
    mainMarker: "registerInlayHintsProvider",
  },
  {
    feature: "go-to-definition",
    serverMarker: "connection.onDefinition",
    adapterExport: "definition",
    mainMarker: "registerDefinitionProvider",
  },
  {
    feature: "document formatting",
    serverMarker: "connection.onDocumentFormatting",
    // The playground wires formatting WITHOUT an `lspAdapter` binding: the
    // Format toolbar button calls `compiler/format.ts`'s `format()` directly
    // (`main.ts`), the same whole-document formatter the LSP's
    // `onDocumentFormatting` uses. Recognized as provider-less wiring.
    adapterExport: null,
    mainMarker: "format(model.getValue())",
  },

  // ---- KNOWN PARITY GAPS (LSP exposes it; playground does NOT wire it) -------
  //
  // These rows DOCUMENT the current drift. They are asserted as known gaps:
  // the test confirms the playground still lacks the wiring. CLOSING a gap
  // (adding the adapter export + Monaco provider) will FAIL the matching
  // assertion below, prompting you to delete the TODO and convert the row into
  // a real in-parity row above.
  {
    // TODO parity: the LSP exposes `onCodeAction` AND `lspAdapter.ts` already
    // exports `codeActions`, but `main.ts` never registers a Monaco
    // `CodeActionProvider` — so the playground's "Auto Fix" lightbulb is
    // silently missing. Wire `registerCodeActionProvider` in `main.ts`, then
    // move this row up and drop `knownGap`.
    feature: "code actions (quick-fix / Auto Fix)",
    serverMarker: "connection.onCodeAction",
    adapterExport: "codeActions", // adapter binding already exists
    mainMarker: "registerCodeActionProvider", // ← missing in main.ts
    knownGap: "main.ts has no registerCodeActionProvider (Auto Fix unwired)",
  },
  {
    // TODO parity: the LSP exposes find-all-references (`onReferences`,
    // cross-file aware), but the playground has neither an `lspAdapter`
    // `references` binding nor a Monaco `ReferenceProvider`. Add both, then
    // move this row up and drop `knownGap`.
    feature: "find references",
    serverMarker: "connection.onReferences",
    adapterExport: "references", // ← missing in lspAdapter.ts
    mainMarker: "registerReferenceProvider", // ← missing in main.ts
    knownGap: "no references adapter export and no registerReferenceProvider",
  },
  {
    // TODO parity: the LSP exposes completion (`onCompletion` — identifier +
    // member + keyword/snippet), but the playground has neither an `lspAdapter`
    // `completion` binding nor a Monaco `CompletionItemProvider`. Add both, then
    // move this row up and drop `knownGap`.
    feature: "completion",
    serverMarker: "connection.onCompletion",
    adapterExport: "completion", // ← missing in lspAdapter.ts
    mainMarker: "registerCompletionItemProvider", // ← missing in main.ts
    knownGap:
      "no completion adapter export and no registerCompletionItemProvider",
  },
];

// --- 0. the table self-validates against server.ts --------------------------
//
// Every row's `serverMarker` must really be in `server.ts`. This is what makes
// the table track the LIVE LSP surface: a handler that's renamed/removed in
// `server.ts` breaks here, and a row whose marker was a typo can't masquerade
// as a real feature.
Deno.test("parity table matches the live LSP surface (server.ts)", () => {
  for (const f of FEATURES) {
    assert(
      serverSrc.includes(f.serverMarker),
      `feature "${f.feature}": server.ts no longer contains "${f.serverMarker}" — ` +
        `the LSP handler was renamed/removed, or the parity row is stale. ` +
        `Update the row (or remove it if the LSP dropped the feature).`,
    );
  }
});

// --- 0b. guard: no LSP handler is missing from the table --------------------
//
// Catch a NEW `server.ts` handler that nobody added a parity row for (the
// reverse-drift the playground "Auto Fix" gap was). We scan for the standard
// `connection.onX(` registrations and the `connection.languages.Y.on(`
// providers and require each to be represented by some row's `serverMarker`.
Deno.test("every server.ts handler has a parity-table row", () => {
  const handlerRe =
    /connection\.(?:on[A-Z]\w*|languages\.\w+\.on)|documents\.onDidChangeContent/g;
  const found = new Set(serverSrc.match(handlerRe) ?? []);
  // Handlers that are NOT user-facing language features (lifecycle / workspace
  // bookkeeping), intentionally excluded from playground parity.
  const NON_FEATURE = new Set([
    "connection.onInitialize",
    "documents.onDidSave", // save-triggered workspace pass; not a Monaco provider
  ]);
  for (const handler of found) {
    if (NON_FEATURE.has(handler)) continue;
    const covered = FEATURES.some((f) => f.serverMarker.startsWith(handler));
    assert(
      covered,
      `server.ts registers "${handler}" but no parity-table row covers it. ` +
        `Add a row to FEATURES (and wire the playground), or add it to ` +
        `NON_FEATURE if it isn't a user-facing language feature.`,
    );
  }
});

// --- 1. adapter export present (real import + typeof) -----------------------
//
// For each feature with an `adapterExport`, the `lspAdapter.ts` module must
// export a function of that name. We imported the module for real, so this is a
// genuine runtime check (not a text grep) — a renamed/removed export is caught.
Deno.test("lspAdapter.ts exports a binding for each in-parity feature", () => {
  const exports = adapter as unknown as Record<string, unknown>;
  for (const f of FEATURES) {
    if (f.adapterExport === null) continue; // provider-less feature (formatting)
    const present = typeof exports[f.adapterExport] === "function";
    if (f.knownGap) {
      // Known gap: the export is EXPECTED to be absent (or the row would be in
      // parity). If it's now present, the gap may be half-closed — only fail
      // when BOTH the export and the main.ts wiring exist (i.e. fully wired),
      // since `codeActions` legitimately exists already while main.ts is unwired.
      const mainWired = f.mainMarker !== null && mainSrc.includes(f.mainMarker);
      assert(
        !(present && mainWired),
        `KNOWN GAP CLOSED: "${f.feature}" is now fully wired (adapter export ` +
          `"${f.adapterExport}" + main.ts "${f.mainMarker}"). Move this row to ` +
          `the in-parity section and delete its \`knownGap\`.`,
      );
      continue;
    }
    assert(
      present,
      `MISSING ADAPTER BINDING: lspAdapter.ts must export a "${f.adapterExport}" ` +
        `function for feature "${f.feature}" (the LSP exposes it via ` +
        `"${f.serverMarker}"). Add the pure binding to playground/src/lspAdapter.ts.`,
    );
  }
});

// --- 2. main.ts wires the Monaco provider for each in-parity feature ---------
//
// For each feature with a `mainMarker`, `main.ts`'s source must contain the
// Monaco `register…Provider` / capability call. Source-text presence (not a
// brittle full-line match) keeps this robust to formatting.
Deno.test("main.ts registers a Monaco provider for each in-parity feature", () => {
  for (const f of FEATURES) {
    if (f.mainMarker === null) continue;
    const present = mainSrc.includes(f.mainMarker);
    if (f.knownGap) {
      // Known gap: main.ts is EXPECTED to lack this wiring. If it's now present,
      // the gap is closed — fail so the row gets promoted out of the TODO set.
      assert(
        !present,
        `KNOWN GAP CLOSED: main.ts now contains "${f.mainMarker}" for ` +
          `"${f.feature}". Ensure the adapter export "${f.adapterExport}" exists ` +
          `too, then move this row to the in-parity section and delete \`knownGap\`.`,
      );
      continue;
    }
    assert(
      present,
      `MISSING PLAYGROUND WIRING: main.ts must wire "${f.mainMarker}" for ` +
        `feature "${f.feature}" (the LSP exposes it via "${f.serverMarker}"). ` +
        `A language feature was added to the LSP without wiring the playground ` +
        `Monaco provider. Register it in playground/src/main.ts.`,
    );
  }
});

// --- 3. surface the known gaps loudly (informational, always passes) --------
//
// Not a failure — a single test that prints the current documented gaps so they
// stay visible in CI output and don't quietly accumulate.
Deno.test("DOCUMENTED parity gaps (informational)", () => {
  const gaps = FEATURES.filter((f) => f.knownGap);
  for (const g of gaps) {
    console.log(`  parity gap — ${g.feature}: ${g.knownGap}`);
  }
  // Sanity: every `knownGap` row's promised gap must actually hold right now
  // (the main.ts wiring is the common missing piece for all three).
  assert(
    gaps.every((g) => g.mainMarker !== null && !mainSrc.includes(g.mainMarker)),
    "a row marked knownGap is actually wired in main.ts — promote it.",
  );
});
