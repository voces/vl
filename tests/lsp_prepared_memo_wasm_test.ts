// The wasm checker's PREPARED-STATE MEMO (`lsp/src/wasmChecker.ts`): one entry
// keyed on (source, entryKey, reader, reader generation), holding "this instance
// is staged for that program and `checkSrcSym` has run over it".
//
// Two things need grading and neither implies the other. That the memo is LIVE
// is the `graphCheckCount()` instrument: one editor request runs several
// queries over one unchanged document — `onHover` is a three-rung ladder — and
// must pay ONE whole-graph check, the next query over that document zero. That
// it is still CORRECT is the cross-file pair: the entry file's own text does not
// change when a module it imports does, so the memo would answer with the
// pre-edit types if the two reader components were not part of its key.
//
// These load the real seed (`build/vl-compiler.wasm`); absent (fresh clone, no
// `refresh-compiler.sh` yet) they self-ignore, the convention the rest of the
// wasm suite uses.

import { loadWasmChecker } from "../lsp/src/wasmCheckerNode.ts";

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
const log = (_m: string) => {};

// The entry imports `add` from `./util`, so its `r` has a type only the SIBLING
// knows — which is what makes a stale memo visible as a wrong hover.
const ENTRY_KEY = "/proj/main.vl";
const entry = 'import { add } from "./util"\nconst r = add(1, 2)\nprint(r)\n';
const utilI32 = "export function add(a: i32, b: i32): i32 {\n  a + b\n}\n";
const utilF64 = "export function add(a: i32, b: i32): f64 {\n  1.5\n}\n";

// A reader whose sibling source is swappable — the on-disk edit the test makes
// between two hovers in the UNCHANGED entry.
const readerFor = (util: () => string) => (key: string) =>
  key.endsWith("util.vl") ? util() : undefined;

const want = (what: string, got: unknown, expected: unknown) => {
  if (got !== expected) {
    throw new Error(`${what}: want ${JSON.stringify(expected)}, got ${JSON.stringify(got)}`);
  }
};

// `server.ts`'s hover ladder, verbatim in shape: each rung fires only when the
// one before it had no answer, and all three run when the cursor is on a word
// the checker knows nothing about.
const hoverRequest = async (
  checker: ReturnType<typeof loadWasmChecker>,
  source: string,
  read: (key: string) => string | undefined,
  line: number,
  character: number,
): Promise<string | undefined> => {
  const c = checker!;
  const t = await c.hoverTypeAt(source, ENTRY_KEY, read, line, character);
  if (t !== undefined) return t;
  const m = await c.memberTypeAt(source, ENTRY_KEY, read, line, character);
  if (m !== undefined) return m;
  return await c.typeAliasAt(source, ENTRY_KEY, read, line, character);
};

Deno.test({
  name: "wasm-memo: one hover request is ONE graph check, the next query zero",
  ignore,
}, async () => {
  const c = loadWasmChecker(SEED, log)!;
  const read = readerFor(() => utilI32);
  want("a fresh checker has run nothing", c.graphCheckCount(), 0);

  // The worst case the ladder has: `import` is a word, and no rung resolves it,
  // so all three run. Before the memo this cost three whole-graph checks.
  const nothing = await hoverRequest(c, entry, read, 0, 2);
  want("hovering a keyword answers nothing", nothing, undefined);
  want("the three-rung ladder costs one check", c.graphCheckCount(), 1);

  // A second hover, ANOTHER position, same unchanged document: free.
  const r = await hoverRequest(c, entry, read, 1, 6);
  want("`r`'s type", r, "i32");
  want("a second hover in an unchanged document is free", c.graphCheckCount(), 1);

  // So is every other query family over the same text.
  await c.tokensAt(entry, ENTRY_KEY, read);
  await c.inlayHintsAt(entry, ENTRY_KEY, read);
  await c.scopeAt(entry, ENTRY_KEY, read, 2, 0);
  await c.importedNameSources(entry, ENTRY_KEY, read);
  want("the other query families are free too", c.graphCheckCount(), 1);
});

Deno.test({
  name: "wasm-memo: a dependency edit is seen once the reader generation bumps",
  ignore,
}, async () => {
  const c = loadWasmChecker(SEED, log)!;
  let util = utilI32;
  const read = readerFor(() => util);

  want("`r` before the edit", await hoverRequest(c, entry, read, 1, 6), "i32");
  // Warm, and demonstrably so — without this the test would pass with no memo
  // at all, and the bump below would be proving nothing.
  await hoverRequest(c, entry, read, 1, 6);
  want("the memo is warm", c.graphCheckCount(), 1);

  // The sibling changes on disk behind one unchanged reader. The ENTRY's own
  // text, its key and the reader's identity are all untouched, so nothing but
  // the bump can tell the memo this happened.
  util = utilF64;
  c.bumpReaderGeneration();

  want("`r` after the edit", await hoverRequest(c, entry, read, 1, 6), "f64");
  want("the bump cost exactly one re-check", c.graphCheckCount(), 2);
});

Deno.test({
  name: "wasm-memo: a different READER is a different program",
  ignore,
}, async () => {
  const c = loadWasmChecker(SEED, log)!;
  // Same entry text, same key, two readers answering `./util` differently. The
  // generation cannot see this — nothing told the checker anything changed — so
  // the reader's IDENTITY is the component that must separate them. (This is the
  // case `lsp_wasm_checker_test.ts`'s built-in-name pair found: it checks one
  // entry twice, swapping only the sibling.)
  want("`r` under the i32 sibling", await hoverRequest(c, entry, readerFor(() => utilI32), 1, 6), "i32");
  want("`r` under the f64 sibling", await hoverRequest(c, entry, readerFor(() => utilF64), 1, 6), "f64");
  want("two readers, two checks", c.graphCheckCount(), 2);
});

Deno.test({
  name: "wasm-memo: the entry KEY is part of the key",
  ignore,
}, async () => {
  const c = loadWasmChecker(SEED, log)!;
  const src = "const x = 1\nprint(x)\n";
  const read = () => undefined;
  await c.hoverTypeAt(src, "/proj/a.vl", read, 0, 6);
  await c.hoverTypeAt(src, "/proj/a.vl", read, 1, 6);
  want("one check for the first key", c.graphCheckCount(), 1);
  await c.hoverTypeAt(src, "/proj/b.vl", read, 0, 6);
  want("the same text under another key re-checks", c.graphCheckCount(), 2);
});

Deno.test({
  name: "wasm-memo: `check` leaves a staging a symbol query can finish",
  ignore,
}, async () => {
  const c = loadWasmChecker(SEED, log)!;
  const read = readerFor(() => utilI32);

  // `checkSrc` is not `checkSrcSym` with the symbol table off — it runs the
  // deep-`is` second pass and leaves no occurrence table — so the hover after it
  // still owes a check. What the memo saves is the STAGING: the graph is
  // committed once, and the answer must be the same one a cold hover gives.
  want("no diagnostics", (await c.check(entry, ENTRY_KEY, read)).length, 0);
  want("check is one graph check", c.graphCheckCount(), 1);
  want("`r` after a check", await hoverRequest(c, entry, read, 1, 6), "i32");
  want("the hover owes its own symbol check", c.graphCheckCount(), 2);
  want("and nothing more", (await c.hoverTypeAt(entry, ENTRY_KEY, read, 1, 6)), "i32");
  want("still two", c.graphCheckCount(), 2);
});

Deno.test({
  name: "wasm-memo: a parse-only pass re-stages the source, and the answer holds",
  ignore,
}, async () => {
  const c = loadWasmChecker(SEED, log)!;
  const read = readerFor(() => utilI32);
  await hoverRequest(c, entry, read, 1, 6);

  // `lint`/`formatSrc`/`declExtentsAt` push their own source and destroy the
  // checked tables. Over the SAME text the module table survives, so the hover
  // costs a check and not a re-commit; over another text nothing survives. Both
  // must still answer correctly — that is the half a counter cannot grade.
  c.lint(entry);
  want("`r` after linting the same text", await hoverRequest(c, entry, read, 1, 6), "i32");
  c.lint("const q = 2\nprint(q)\n");
  want("`r` after linting another text", await hoverRequest(c, entry, read, 1, 6), "i32");
  c.formatSrc(entry);
  want("`r` after formatting", await hoverRequest(c, entry, read, 1, 6), "i32");
  c.declExtentsAt("const z = 3\n");
  want("`r` after extents over another text", await hoverRequest(c, entry, read, 1, 6), "i32");

  // `moduleSurface` resets the module table and commits ONE module — nothing of
  // the previous staging survives that.
  const surface = c.moduleSurface(utilI32, "/proj/util.vl");
  want("the sibling's surface", surface.exports.map((e) => e.name).join(","), "add");
  want("`r` after a surface scan", await hoverRequest(c, entry, read, 1, 6), "i32");
});

Deno.test({
  name: "wasm-memo: the highlight pair (references + definition) is one check",
  ignore,
}, async () => {
  const c = loadWasmChecker(SEED, log)!;
  const read = readerFor(() => utilI32);
  // `onDocumentHighlight` asks both at the same cursor over the same text.
  const refs = await c.referencesAt(entry, ENTRY_KEY, read, 1, 6, true);
  const decl = await c.definitionAt(entry, ENTRY_KEY, read, 1, 6);
  want("both occurrences of `r`", refs.length, 2);
  if (decl === undefined) throw new Error("want a declaration span for `r`, got undefined");
  want("the pair costs one graph check", c.graphCheckCount(), 1);
});
