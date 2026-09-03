// Where the CORPUS ORACLE's seconds go, in one process, split by cost centre:
// the per-code-point intake it uses vs the bulk `srcLoad` the Rust host uses,
// `checkSrc`, `lintSrc` (a SECOND parse of every clean case), `compileSrc`, the
// per-byte `rbyteAt` read-back, and V8's own compile+run of each emitted module.
// Also answers whether per-case cost DRIFTS on the one instance the oracle keeps.
//   deno run -A scripts/perf/oracle-abi-probe.ts [n-cases]
import { runWasm } from "../../tests/support/runWasm.ts";
const SEED = new URL("../../build/vl-compiler.wasm", import.meta.url).pathname;
const DIR = new URL("../../tests/cases/", import.meta.url).pathname;
type Ex = Record<string, (...a: number[]) => number> & {
  memory?: WebAssembly.Memory;
  ioMem?: WebAssembly.Memory;
};
const mod = new WebAssembly.Module(Deno.readFileSync(SEED));
const exp = new WebAssembly.Instance(mod, {}).exports as unknown as Ex;

const walk = function* (d: string): Generator<string> {
  for (const e of Deno.readDirSync(d)) {
    const p = d + e.name;
    if (e.isDirectory) yield* walk(p + "/");
    else if (e.name.endsWith(".vl")) yield p;
  }
};
const all = [...walk(DIR)].sort();
const n = Number(Deno.args[0] ?? all.length);
const srcs = all.slice(0, n).map((f) => Deno.readTextFileSync(f))
  .filter((s) => !/^\s*\/\/\s*@(module|import)/m.test(s));

const push = (s: string) => {
  for (const ch of s) exp.srcPush(ch.codePointAt(0)!);
};
const load = (s: string) => {
  const mem = (exp.ioMem ?? exp.memory)!;
  const cap = (mem.buffer.byteLength / 4) | 0;
  const cps = Array.from(s, (c) => c.codePointAt(0)!);
  for (let off = 0; off < cps.length;) {
    const k = Math.min(cap, cps.length - off);
    const view = new Int32Array(mem.buffer, 0, k);
    for (let i = 0; i < k; i++) view[i] = cps[off + i];
    exp.srcLoad(k);
    off += k;
  }
};
const t0 = () => performance.now();
const T: Record<string, number> = {
  push: 0,
  srcLoad: 0,
  checkSrc: 0,
  lintSrc: 0,
  compileSrc: 0,
  rbyteAt: 0,
  v8Module: 0,
  runWasm: 0,
};
const bump = (k: string, f: () => void) => {
  const t = t0();
  f();
  T[k] += t0() - t;
};

let cps = 0, runs = 0, bytes = 0;
const drift: number[] = [];
for (const s of srcs) {
  cps += Array.from(s).length;
  const isRun = /^\s*\/\/\s*@run\b/m.test(s);
  exp.modReset();
  exp.srcReset();
  bump("push", () => push(s));
  exp.srcReset();
  bump("srcLoad", () => load(s));
  const t = t0();
  let rc = 0;
  bump("checkSrc", () => {
    rc = exp.checkSrc();
  });
  exp.modReset();
  exp.srcReset();
  push(s);
  bump("lintSrc", () => exp.lintSrc());
  if (isRun && rc === 0) {
    exp.modReset();
    exp.srcReset();
    push(s);
    let crc = 0;
    bump("compileSrc", () => {
      crc = exp.compileSrc();
    });
    if (crc === 0) {
      runs++;
      let b = new Uint8Array(0);
      bump("rbyteAt", () => {
        const k = exp.rbyteLen();
        b = new Uint8Array(k);
        for (let i = 0; i < k; i++) b[i] = exp.rbyteAt(i);
      });
      bytes += b.length;
      bump("v8Module", () => {
        try {
          new WebAssembly.Module(b);
        } catch { /* @no-instantiate cases */ }
      });
      const tr = t0();
      try {
        await runWasm(b);
      } catch { /* @trap / @no-instantiate cases */ }
      T.runWasm += t0() - tr;
    }
  }
  drift.push(t0() - t);
}
const q = (a: number[]) => {
  const k = Math.ceil(a.length / 5);
  const avg = (x: number[]) => x.reduce((p, c) => p + c, 0) / x.length;
  return [0, 1, 2, 3, 4].map((i) => avg(a.slice(i * k, (i + 1) * k)).toFixed(2));
};
console.log(
  `${srcs.length} single-file cases, ${cps} code points, ` +
    `${runs} emitted modules, ${bytes} emitted bytes`,
);
const tot = Object.values(T).reduce((p, c) => p + c, 0);
for (const [k, v] of Object.entries(T).sort((a, b) => b[1] - a[1])) {
  console.log(`${v.toFixed(0).padStart(7)} ms  ${(100 * v / tot).toFixed(1).padStart(5)}%  ${k}`);
}
console.log(`${tot.toFixed(0).padStart(7)} ms  100.0%  TOTAL (in-process)`);
console.log(`drift, mean ms/case by fifth: ${q(drift).join("  ")}`);
