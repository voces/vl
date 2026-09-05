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
  name: "wasm-memo: `check` leaves a CHECKED staging, so the hover after it is free",
  ignore,
}, async () => {
  const c = loadWasmChecker(SEED, log)!;
  const read = readerFor(() => utilI32);

  // `check` runs the SAME symbol-aware entry the queries do, so what it leaves
  // is not just the staging but the occurrence tables. Before, `checkSrc` ran
  // with the symbol table off and the hover after it owed a second whole-graph
  // check over the very same text.
  want("no diagnostics", (await c.check(entry, ENTRY_KEY, read)).length, 0);
  want("check is one graph check", c.graphCheckCount(), 1);
  want("`r` after a check", await hoverRequest(c, entry, read, 1, 6), "i32");
  want("and the hover owes nothing", c.graphCheckCount(), 1);
  want("nor does the next one", (await c.hoverTypeAt(entry, ENTRY_KEY, read, 1, 6)), "i32");
  want("still one", c.graphCheckCount(), 1);
});

// `server.ts`'s `onDidChangeContent`, in the order it runs its three checker
// calls: the unused-export hints (`moduleSurface`, which resets the module
// table), the parse-only `lint`, and the graph `check` LAST — the only one that
// leaves a checked graph, and the reason the queries after an edit are free.
const changeRequest = async (
  checker: ReturnType<typeof loadWasmChecker>,
  source: string,
  read: (key: string) => string | undefined,
) => {
  const c = checker!;
  c.bumpReaderGeneration();
  c.moduleSurface(source, ENTRY_KEY);
  c.lint(source);
  return await c.check(source, ENTRY_KEY, read);
};

Deno.test({
  name: "wasm-memo: an edit then a hover is ONE graph check, not two",
  ignore,
}, async () => {
  const c = loadWasmChecker(SEED, log)!;
  const read = readerFor(() => utilI32);
  const edited = `${entry}// typed\n`;

  // A steady-state keystroke: the entry's own text moved, the DEPENDENCY did
  // not. The bump invalidates the memo, the check re-fills it, and the hover
  // that follows rides it.
  await changeRequest(c, entry, read);
  const before = c.graphCheckCount();
  want("no diagnostics for the edited text", (await changeRequest(c, edited, read)).length, 0);
  want("`r` after the edit", await hoverRequest(c, edited, read, 1, 6), "i32");
  want("the edit + the hover cost one check", c.graphCheckCount() - before, 1);

  // The invalidation rules #2593 built are untouched: the sibling moving on disk
  // behind an unchanged entry still costs its own re-check, and still answers.
  let util = utilI32;
  const swappable = readerFor(() => util);
  const c2 = loadWasmChecker(SEED, log)!;
  await changeRequest(c2, entry, swappable);
  want("`r` under the i32 sibling", await hoverRequest(c2, entry, swappable, 1, 6), "i32");
  const mid = c2.graphCheckCount();
  util = utilF64;
  c2.bumpReaderGeneration();
  want("`r` after the dependency edit", await hoverRequest(c2, entry, swappable, 1, 6), "f64");
  want("which cost exactly one re-check", c2.graphCheckCount() - mid, 1);
});

// `onSemanticTokens`'s three calls, in `server.ts`'s order. The last of them is
// the LEXICAL slice, and it re-pushes the entry source — `lexScan` writes only
// its own four span tables and calls `tokenize`, whose state is the lexer's own
// scanner globals, so over the text already staged the check survives it.
const tokensRequest = async (
  checker: ReturnType<typeof loadWasmChecker>,
  source: string,
  read: (key: string) => string | undefined,
) => {
  const c = checker!;
  await c.tokensAt(source, ENTRY_KEY, read);
  await c.memberTokensAt(source, ENTRY_KEY, read);
  return c.lexicalTokensAt(source);
};

Deno.test({
  name: "wasm-memo: the whole keystroke burst is ONE graph check",
  ignore,
}, async () => {
  const c = loadWasmChecker(SEED, log)!;
  const read = readerFor(() => utilI32);
  const edited = `${entry}// typed\n`;

  // Everything VS Code sends after one keystroke: the change handler, then the
  // hover, the semantic tokens and the inlay hints it re-requests. Each of the
  // four is a separate request over the same unchanged text.
  await changeRequest(c, entry, read);
  const before = c.graphCheckCount();
  await changeRequest(c, edited, read);
  const afterChange = c.graphCheckCount();
  want("the change is the one check", afterChange - before, 1);
  want("`r` on hover", await hoverRequest(c, edited, read, 1, 6), "i32");
  const lex = await tokensRequest(c, edited, read);
  if (lex.length === 0) throw new Error("want lexical tokens for the edited text, got none");
  const hints = await c.inlayHintsAt(edited, ENTRY_KEY, read);
  want("the inlay hint for `r`", hints.map((h) => h.type).join(","), "i32");
  want("the burst is one graph check", c.graphCheckCount() - before, 1);
});

Deno.test({
  name: "wasm-memo: a lexical scan keeps the check only over the text already staged",
  ignore,
}, async () => {
  const c = loadWasmChecker(SEED, log)!;
  const read = readerFor(() => utilI32);
  want("`r`", await hoverRequest(c, entry, read, 1, 6), "i32");
  want("one check", c.graphCheckCount(), 1);

  // SAME text: free, and still right.
  c.lexicalTokensAt(entry);
  want("`r` after a lexical scan of the same text", await hoverRequest(c, entry, read, 1, 6), "i32");
  want("which cost nothing", c.graphCheckCount(), 1);

  // ANOTHER text: the instance now holds a program the memo does not describe,
  // so the staging must be gone — the answer has to be re-earned, not reused.
  c.lexicalTokensAt("const q = 2\nprint(q)\n");
  want("`r` after a lexical scan of another text", await hoverRequest(c, entry, read, 1, 6), "i32");
  want("which cost a re-check", c.graphCheckCount(), 2);

  // And the DESTRUCTIVE parse-only passes still downgrade the same text: `lint`
  // re-lexes into `P.toks` and re-parses the arena, so the tables are gone even
  // though the module table is not.
  c.lint(entry);
  want("`r` after a lint of the same text", await hoverRequest(c, entry, read, 1, 6), "i32");
  want("which cost its own check", c.graphCheckCount(), 3);
});

// The raw seed instance, driven the way `wasmChecker`'s `check` used to: stage
// the source and run `checkSrc`, the entry with the symbol table OFF. This is
// the BEFORE arm of the diagnostics control below — same seed, other entry — so
// the test compares two real answers rather than one answer against a literal.
const plainCheckDiags = (source: string): string[] => {
  const exp = new WebAssembly.Instance(
    new WebAssembly.Module(Deno.readFileSync(SEED)),
    {},
  ).exports as unknown as Record<string, (...a: number[]) => number>;
  exp.modReset();
  exp.srcReset();
  for (const ch of source) exp.srcPush(ch.codePointAt(0)!);
  exp.checkSrc();
  const out: string[] = [];
  for (let i = 0; i < exp.diagCount(); i++) {
    const b = new Uint8Array(exp.diagMsgLen(i));
    for (let j = 0; j < b.length; j++) b[j] = exp.diagMsgAt(i, j);
    out.push(`${exp.diagLine(i)}:${exp.diagCol(i)}:${new TextDecoder().decode(b)}`);
  }
  return out;
};

Deno.test({
  name: "wasm-memo: the diagnostics are the plain check's, message for message",
  ignore,
}, async () => {
  const c = loadWasmChecker(SEED, log)!;
  const read = () => undefined;

  // Two errors, so an ordering or a truncation shows. The `check` arm now runs
  // `checkSrcSym`; the control runs `checkSrc` on a separate instance.
  const twoErrors = 'const x: i32 = "no"\nconst y: string = 1\nprint(x)\nprint(y)\n';
  const got = (await c.check(twoErrors, ENTRY_KEY, read))
    .map((d) => `${d.range.start.line + 1}:${d.range.start.character}:${d.message}`);
  want("two errors", got.length, 2);
  want("same diagnostics as `checkSrc`", got.join("\n"), plainCheckDiags(twoErrors).join("\n"));

  // The one diagnostic the symbol check did NOT used to report: a deep-`is` arm
  // that writes its own receiver refuses in the SECOND pass, which only
  // `checkSrc` ran. A `checkSrcSym` without it publishes a clean file for a
  // program `vl build` refuses — the reason the parity is a compiler change and
  // not a host one.
  const deepIs = `type Json = null | boolean | f64 | string | Json[] | { [string]: Json }
type Cfg = { port: i32, host: string | null }
let g: Json = null
function a(): i32 { if g is Cfg { g = null  return 1 }  0 }
print(a())
`;
  const deep = await c.check(deepIs, ENTRY_KEY, read);
  want("the deep-\`is\` refusal reaches the editor", deep.length, 1);
  want(
    "and it is the plain check's",
    `${deep[0].range.start.line + 1}:${deep[0].range.start.character}:${deep[0].message}`,
    plainCheckDiags(deepIs).join("\n"),
  );
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
