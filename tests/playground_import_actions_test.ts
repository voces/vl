// The playground adapter's IMPORT-editing behaviours — the three that
// `SUB_GAPS` in `playground_lsp_parity_test.ts` tracked as gaps under the
// "completion" and "code actions" feature labels, now composed by the adapter
// (ROADMAP row 32's residue):
//   - `stdAutoImportCompletions` — an unimported std name is offered with the
//     `import { … } from "std:…"` rewrite on accept (`additionalTextEdits`).
//   - `ufcsImportFixes` — a missing-UFCS-import diagnostic offers "Import
//     `name` from "M"", the candidate modules straight off the diagnostic's
//     `data.modules` (no second query).
//   - `organizeImportEdits` — organize drops a redundant specifier, unused AND
//     duplicate alike, reprinting the survivor through the seed's formatter.
//
// These drive the pure adapter exports (no Monaco) against the real seed, so
// they self-ignore when it isn't built. The checker is created with the SAME
// std-resolving reader wrapper the browser uses (`wasmCheckerBrowser.ts`'s
// `wrapReader`), because a UFCS import fix needs `import "std:test"` to resolve.

import { codeActions, completion, diagnostics, initLsp, organizeImports } from "../playground/src/lspAdapter.ts";
import { createWasmChecker, type Exports } from "../lsp/src/wasmChecker.ts";
import { wrapStdReader } from "../lsp/src/editorText.ts";

const SEED = new URL("../build/vl-compiler.wasm", import.meta.url).pathname;
const seedExists = (() => {
  try {
    Deno.statSync(SEED);
    return true;
  } catch {
    return false;
  }
})();
const ignore = !seedExists;

const module = seedExists
  ? new WebAssembly.Module(Deno.readFileSync(SEED) as BufferSource)
  : undefined;

const init = (): void => {
  if (!module) throw new Error(`no seed at ${SEED}`);
  const instance = new WebAssembly.Instance(module, {});
  // `wrapStdReader` is the browser's own reader wrapper — a `std:` key resolves
  // from the embedded map — so a UFCS import fix's `import "std:test"` resolves.
  initLsp(createWasmChecker(() => instance.exports as unknown as Exports, wrapStdReader));
};

const assert = (cond: boolean, msg: string): void => {
  if (!cond) throw new Error(msg);
};

// ---- std auto-import completions --------------------------------------------

Deno.test({ name: "auto-import: an unimported std name is offered with its import edit", ignore }, async () => {
  init();
  // `trim` (std:str) is used but not imported. The identifier-position completion
  // must include it as an auto-import item carrying the import rewrite.
  const items = await completion('print(trim("  x  "))\n', { line: 0, character: 6 });
  const trim = items.find((i) => i.label === "trim" && i.additionalTextEdits !== undefined);
  assert(trim !== undefined, "an auto-import `trim` item with additionalTextEdits");
  assert(trim!.description === "std:str", `the providing module, got ${trim!.description}`);
  const edit = trim!.additionalTextEdits![0];
  assert(
    edit.newText.includes('import { trim } from "std:str"'),
    `the import rewrite, got ${JSON.stringify(edit.newText)}`,
  );
});

Deno.test({ name: "auto-import: a name already in scope is NOT re-offered as an import", ignore }, async () => {
  init();
  // `trim` is imported, so it must not appear a SECOND time with an import edit.
  const src = 'import { trim } from "std:str"\n\nprint(trim("  x  "))\n';
  const items = await completion(src, { line: 2, character: 6 });
  assert(
    !items.some((i) => i.label === "trim" && i.additionalTextEdits !== undefined),
    "no auto-import item for an already-imported name",
  );
});

// ---- UFCS import quick-fix ---------------------------------------------------

Deno.test({ name: "ufcs-fix: a missing UFCS import offers the module the checker named", ignore }, async () => {
  init();
  // `toEqual` is a free `self`-function in std:test; `expect` is imported, `toEqual` is not.
  const src = 'import { expect } from "std:test"\n\nexpect(1 + 2).toEqual(3)\n';
  const diags = await diagnostics(src, "main.vl");
  const ufcs = diags.find((d) => d.code === "ufcs-not-imported");
  assert(ufcs !== undefined, `the ufcs-not-imported diagnostic, got ${JSON.stringify(diags.map((d) => d.code))}`);
  const fixes = await codeActions(
    src,
    { start: { line: 2, character: 14 }, end: { line: 2, character: 21 } },
    [],
    "main.vl",
  );
  const fix = fixes.find((f) => f.title === 'Import `toEqual` from "std:test"');
  assert(fix !== undefined, `the import fix, got ${JSON.stringify(fixes.map((f) => f.title))}`);
  assert(
    fix!.edits[0].newText === 'import { expect, toEqual } from "std:test"',
    `extends the existing import, got ${JSON.stringify(fix!.edits[0].newText)}`,
  );
});

// ---- organize imports --------------------------------------------------------

Deno.test({ name: "organize: an unused specifier is dropped", ignore }, async () => {
  init();
  const edits = await organizeImports('import { trim, join } from "std:str"\nprint(trim("  x  "))\n');
  assert(edits.length === 1, `one edit, got ${JSON.stringify(edits)}`);
  assert(
    edits[0].newText === 'import { trim } from "std:str"',
    `drops the unused, got ${JSON.stringify(edits[0].newText)}`,
  );
});

Deno.test({ name: "organize: a duplicate specifier is dropped", ignore }, async () => {
  init();
  const edits = await organizeImports('import { trim, trim } from "std:str"\nprint(trim("  x  "))\n');
  assert(edits.length === 1, `one edit, got ${JSON.stringify(edits)}`);
  assert(
    edits[0].newText === 'import { trim } from "std:str"',
    `drops the duplicate, got ${JSON.stringify(edits[0].newText)}`,
  );
});

Deno.test({ name: "organize: an already-organized file yields no edits", ignore }, async () => {
  init();
  const edits = await organizeImports('import { trim } from "std:str"\nprint(trim("  x  "))\n');
  assert(edits.length === 0, `no edits, got ${JSON.stringify(edits)}`);
});
