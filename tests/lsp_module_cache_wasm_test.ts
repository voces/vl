// THE PER-MODULE STAGING CACHE — the seed's own scan/token cache, and the LSP's use
// of it (`compiler/driver.vl`'s `modCache*` + `modCommitCached`,
// `lsp/src/wasmChecker.ts`'s `prepare`).
//
// Two properties, and neither implies the other:
//
//   * It is LIVE. A whole-graph check re-commits every module on every keystroke; all
//     but the edited one are byte-identical to what the seed already holds, so exactly
//     one module's source may cross the boundary. `stagingCounts()` says which route
//     each commit took.
//   * It is BOUNDED. The cache holds at most one slot per module key. Keyed on (key,
//     source) and append-only, an editor banked a fresh source and token stream on every
//     keystroke and none of them could ever be hit again — 100 keystrokes on a 26k-line
//     entry took the process to 2.8 GB (`docs/internals/perf-opportunities-2026-09.md` C2c).
//
// Correctness — a dependency edit must reach the importer, and reverting it must come
// back — is graded in `tests/vl_instance_state_leak_test.ts`, beside the other
// one-instance-many-programs invariants.
//
// These load the real seed (`build/vl-compiler.wasm`); absent, they self-ignore.

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

type Exports = Record<string, (...args: number[]) => number>;

// A four-module graph: the entry plus three siblings, so "all but the edited one" is a
// claim with more than one witness behind it.
const ENTRY_KEY = "/proj/main.vl";
const ENTRY = 'import { a } from "./a"\nimport { b } from "./b"\n' +
  'import { c } from "./c"\nprint(a() + b() + c())\n';
const SIBLINGS: Record<string, string> = {
  "/proj/a.vl": "export function a(): i32 {\n  1\n}\n",
  "/proj/b.vl": "export function b(): i32 {\n  2\n}\n",
  "/proj/c.vl": "export function c(): i32 {\n  3\n}\n",
};
const read = (key: string): string | undefined => SIBLINGS[key];

const want = (what: string, got: unknown, expected: unknown) => {
  if (got !== expected) {
    throw new Error(`${what}: want ${JSON.stringify(expected)}, got ${JSON.stringify(got)}`);
  }
};

Deno.test({
  name: "module-cache: re-staging after an edit pushes the entry and nothing else",
  ignore,
}, async () => {
  const c = loadWasmChecker(SEED, log)!;
  want("a fresh checker has staged nothing", c.stagingCounts().pushed, 0);

  // The first check knows nothing, so every module's source crosses.
  await c.check(ENTRY, ENTRY_KEY, read);
  const first = c.stagingCounts();
  want("the first staging pushes all four", first.pushed, 4);
  want("…and serves none from the cache", first.cached, 0);

  // A keystroke: the entry's text moves, the siblings do not, and the reader
  // generation bumps exactly as `documents.onDidChangeContent` bumps it.
  c.bumpReaderGeneration();
  await c.check(ENTRY + "// edit\n", ENTRY_KEY, read);
  const second = c.stagingCounts();
  want("the second staging pushes only the edited entry", second.pushed - first.pushed, 1);
  want("the three unchanged siblings come from the cache", second.cached - first.cached, 3);
});

Deno.test({
  name: "module-cache: a sibling edit pushes that sibling too",
  ignore,
}, async () => {
  const c = loadWasmChecker(SEED, log)!;
  let a = SIBLINGS["/proj/a.vl"];
  const swappable = (key: string) => key.endsWith("/a.vl") ? a : SIBLINGS[key];
  await c.check(ENTRY, ENTRY_KEY, swappable);
  const first = c.stagingCounts();

  a = "export function a(): i32 {\n  9\n}\n";
  c.bumpReaderGeneration();
  await c.check(ENTRY + "// edit\n", ENTRY_KEY, swappable);
  const second = c.stagingCounts();
  want("the entry and the changed sibling both push", second.pushed - first.pushed, 2);
  want("the two untouched siblings do not", second.cached - first.cached, 2);
});

Deno.test({
  name: "module-cache: the seed holds one slot per key however many edits arrive",
  ignore,
}, () => {
  const exp = new WebAssembly.Instance(
    new WebAssembly.Module(Deno.readFileSync(SEED)),
    {},
  ).exports as unknown as Exports;
  if (typeof exp.modCacheStat !== "function") {
    throw new Error("this seed predates `modCacheStat` — rebuild it (refresh-compiler.sh)");
  }
  const push = (fn: (cp: number) => number, text: string) => {
    for (const ch of text) fn(ch.codePointAt(0)!);
  };
  const readStr = (len: number, at: (j: number) => number) => {
    const b = new Uint8Array(len);
    for (let j = 0; j < len; j++) b[j] = at(j);
    return new TextDecoder().decode(b);
  };
  // `prepare`'s loop with every module pushed in full: this grades the SEED's storage,
  // not the host memo that usually keeps the siblings off the wire.
  const stage = (entry: string) => {
    exp.modReset();
    const commit = (key: string, src: string | undefined) => {
      push(exp.modKeyPush, key);
      if (src !== undefined) push(exp.modSrcPush, src);
      exp.modCommit(src !== undefined ? 1 : 0);
    };
    commit(ENTRY_KEY, entry);
    for (;;) {
      const n = exp.modPendingCount();
      if (n === 0) break;
      const keys: string[] = [];
      for (let i = 0; i < n; i++) {
        keys.push(readStr(exp.modPendingLen(i), (j) => exp.modPendingAt(i, j)));
      }
      for (const k of keys) commit(k, read(k));
    }
  };

  stage(ENTRY);
  const rows = exp.modCacheStat(1);
  want("four modules, four slots", exp.modCacheStat(0), 4);

  // The FIRST edit drops the entry's slot from the middle of the flat store — the
  // deps banked after it — so one slot's rows are left behind. Every later edit
  // drops a slot whose rows ARE trailing, and gives them straight back.
  for (let i = 0; i < 40; i++) stage(ENTRY + `// keystroke ${i}\n`);
  const after = { slots: exp.modCacheStat(0), rows: exp.modCacheStat(1) };
  if (after.slots > 5) {
    throw new Error(
      `UNBOUNDED SLOTS — 40 edits of one entry left ${after.slots} slots for a ` +
        `four-module graph. At most one dropped slot survives, at the position the ` +
        `first edit vacated.`,
    );
  }
  if (after.rows > rows * 2) {
    throw new Error(
      `UNBOUNDED TOKEN STORE — 40 edits of one entry grew the banked token rows from ` +
        `${rows} to ${after.rows}. A slot dropped for a new source must give its rows ` +
        `back, or the language server grows for as long as the file is open.`,
    );
  }
  // A clear is the storage bound's fallback, for the pattern that leaves a dropped
  // slot's rows stranded on every edit (alternating between two entries). Editing one
  // file must never reach it: a clear costs a re-scan of the whole graph.
  want("no whole-cache clear while one file is edited", exp.modCacheStat(3), 0);
});
