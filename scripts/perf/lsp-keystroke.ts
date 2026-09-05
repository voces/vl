// PART C2: one LSP keystroke, in two views.
//
// RAW drives the seed's driver exports the way `lsp/src/wasmChecker.ts`'s `prepare` +
// `ensurePrepared` do, pushing every module in full, and splits the host-visible halves.
// That is the denominator `scripts/perf/profile-phases.py` divides.
//
// CHECKER runs the real `WasmChecker.check` over the same graphs with the reader
// generation bumped between edits, exactly as `documents.onDidChangeContent` bumps it, so
// the staging memo and the seed's per-module cache are both live. `stagingCounts()` says
// how many modules' text actually crossed the boundary.
//
// The SECOND edit is the row that matters: the first pays for a cold cache, the second is
// the steady state a keystroke costs. Read the ratios, not the wall times; the box is
// shared and the load line is printed.
//
//   deno run -A scripts/perf/lsp-keystroke.ts [seed.wasm] [reps]

import { loadWasmChecker } from "../../lsp/src/wasmCheckerNode.ts";

const ROOT = new URL("../../", import.meta.url).pathname.replace(/\/$/, "");
const SEED = Deno.args[0] ?? `${ROOT}/build/vl-compiler.wasm`;
const REPS = Number(Deno.args[1] ?? "3");

type Exports = Record<string, (...a: number[]) => number>;

const exp = new WebAssembly.Instance(
  new WebAssembly.Module(Deno.readFileSync(SEED)),
  {},
).exports as unknown as Exports;

const pushString = (push: (cp: number) => number, text: string) => {
  for (const ch of text) push(ch.codePointAt(0)!);
};
const readString = (len: number, at: (j: number) => number): string => {
  const b = new Uint8Array(len);
  for (let j = 0; j < len; j++) b[j] = at(j);
  return new TextDecoder().decode(b);
};

// The workspace reader's shape: `std:x` is `<root>/std/x.vl`, everything else is
// already an absolute path by the time the driver asks for it.
const readModule = (key: string): string | undefined => {
  const p = key.startsWith("std:") ? `${ROOT}/std/${key.slice(4)}.vl` : key;
  try {
    return Deno.readTextFileSync(p);
  } catch {
    return undefined;
  }
};

type Row = {
  push: number;
  commit: number;
  reader: number;
  stage: number;
  check: number;
  mods: number;
  bytes: number;
  rc: number;
};

const once = (source: string, entryKey: string): Row => {
  let push = 0, commit = 0, reader = 0, bytes = 0, mods = 0;
  const t0 = performance.now();
  exp.modReset();
  const send = (key: string, src: string | undefined) => {
    let t = performance.now();
    pushString(exp.modKeyPush, key);
    if (src !== undefined) {
      pushString(exp.modSrcPush, src);
      bytes += src.length;
    }
    push += performance.now() - t;
    t = performance.now();
    exp.modCommit(src !== undefined ? 1 : 0);
    commit += performance.now() - t;
    mods++;
  };
  send(entryKey, source);
  for (;;) {
    const n = exp.modPendingCount();
    if (n === 0) break;
    const keys: string[] = [];
    for (let i = 0; i < n; i++) {
      keys.push(readString(exp.modPendingLen(i), (j) => exp.modPendingAt(i, j)));
    }
    for (const key of keys) {
      const t = performance.now();
      const src = readModule(key);
      reader += performance.now() - t;
      send(key, src);
    }
  }
  exp.srcReset();
  pushString(exp.srcPush, source);
  const stage = performance.now() - t0;
  const t1 = performance.now();
  const rc = exp.checkSrcSym();
  return { push, commit, reader, stage, check: performance.now() - t1, mods, bytes, rc };
};

const med = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];

const CASES: [string, string, string][] = [
  ["1 module", "/proj/main.vl", "print(1)\n"],
  [
    "4 modules (std:json + std:fmt)",
    "/proj/main.vl",
    'import { parseJson } from "std:json"\nimport { toString } from "std:fmt"\n' +
    'print(toString(1))\nprint(parseJson("1") != null)\n',
  ],
  [
    "compiler/entry.vl",
    `${ROOT}/compiler/entry.vl`,
    Deno.readTextFileSync(`${ROOT}/compiler/entry.vl`),
  ],
];

console.log(`# seed ${SEED}`);
console.log(`# load: ${Deno.readTextFileSync("/proc/loadavg").trim()}`);
console.log("");
console.log("## RAW — every module pushed in full");
console.log(
  "| case | mods | src KB | edit | reader | push | commit | STAGE | checkSrcSym | rc |",
);
console.log("| --- | ---: | ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: |");
for (const [name, key, base] of CASES) {
  const first: Row[] = [];
  const second: Row[] = [];
  for (let r = 0; r < REPS; r++) {
    first.push(once(`${base}\n// edit ${r}a\n`, key));
    second.push(once(`${base}\n// edit ${r}b\n`, key));
  }
  for (const [label, rows] of [["1st", first], ["2nd", second]] as const) {
    const p = (f: (x: Row) => number) => med(rows.map(f)).toFixed(1);
    const a = rows[0];
    console.log(
      `| ${name} | ${a.mods} | ${(a.bytes / 1024).toFixed(0)} | ${label} | ${
        p((x) => x.reader)
      } | ${p((x) => x.push)} | ${p((x) => x.commit)} | ${p((x) => x.stage)} | ${
        p((x) => x.check)
      } | ${a.rc} |`,
    );
  }
}
console.log(`# load: ${Deno.readTextFileSync("/proc/loadavg").trim()}`);

// ── through the checker, with both caches live ────────────────────────────────────────
console.log("");
console.log("## CHECKER — `WasmChecker.check`, the reader generation bumped per edit");
console.log("| case | edit | check ms | pushed | cached |");
console.log("| --- | --- | ---: | ---: | ---: |");
for (const [name, key, base] of CASES) {
  const c = loadWasmChecker(SEED, () => {})!;
  const first: number[] = [];
  const later: number[] = [];
  let counts = c.stagingCounts();
  let firstPushed = 0, firstCached = 0, laterPushed = 0, laterCached = 0;
  for (let r = 0; r <= REPS; r++) {
    c.bumpReaderGeneration();
    const t = performance.now();
    await c.check(`${base}\n// edit ${r}\n`, key, readModule);
    const ms = performance.now() - t;
    const now = c.stagingCounts();
    if (r === 0) {
      first.push(ms);
      firstPushed = now.pushed - counts.pushed;
      firstCached = now.cached - counts.cached;
    } else {
      later.push(ms);
      laterPushed = now.pushed - counts.pushed;
      laterCached = now.cached - counts.cached;
    }
    counts = now;
  }
  console.log(`| ${name} | 1st | ${med(first).toFixed(1)} | ${firstPushed} | ${firstCached} |`);
  console.log(
    `| ${name} | 2nd+ | ${med(later).toFixed(1)} | ${laterPushed} | ${laterCached} |`,
  );
}
console.log(`# load: ${Deno.readTextFileSync("/proc/loadavg").trim()}`);
