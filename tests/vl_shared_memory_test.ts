// `vl build --shared-memory=<pages>` — a linear memory several instances can share.
//
// The flag declares the one memory SHARED (limits flag 0x03) with a max of <pages>, imported
// (`--import-memory`) or defined alike. It is what lets one module run in several Web Workers
// over one `WebAssembly.Memory({ shared: true })`; only the memory is shared, each instance keeps
// its own GC heap and globals. DECISIONS.md §"A shared memory is a build flag" has the rationale.
//
// Gated like the other native suites (binary + seed); the `-O` rows also need binaryen's
// `wasm-opt` under `node_modules/.bin`. The `vl_` prefix puts it in the ci-native glob.
//
// @test-timing native

import { COMPILER, exists, nativeEnv, ROOT, VL } from "./support/tree.ts";

const ENABLED = exists(VL) && exists(COMPILER);
const WASM_OPT = `${ROOT}/node_modules/.bin/wasm-opt`;
const HAVE_OPT = exists(WASM_OPT);
if (!ENABLED) {
  console.warn(
    "[shared-memory] skipped — missing vl binary or seed wasm. Build:\n" +
      "  (cd scripts/vl-host && cargo build --release)\n" +
      "  scripts/refresh-compiler.sh",
  );
}

const dec = new TextDecoder();

const vl = async (args: string[]) => {
  const env = nativeEnv();
  if (HAVE_OPT) env.VL_WASM_OPT = WASM_OPT;
  const { code, stdout, stderr } = await new Deno.Command(VL, {
    args,
    stdout: "piped",
    stderr: "piped",
    env,
  }).output();
  return { code, out: dec.decode(stdout), err: dec.decode(stderr) };
};

/** Build `src` (or the file at `path`) with `flags`, answering the module bytes. */
const build = async (
  src: string | { path: string },
  flags: string[] = [],
): Promise<Uint8Array> => {
  const tmp = await Deno.makeTempDir();
  try {
    let input = `${tmp}/t.vl`;
    if (typeof src === "string") await Deno.writeTextFile(input, src);
    else input = src.path;
    const r = await vl(
      ["build", input, "-o", `${tmp}/t.wasm`, "--compiler", COMPILER, ...flags],
    );
    if (r.code !== 0) {
      throw new Error(`vl build ${flags.join(" ")} failed: ${r.err.trim()}`);
    }
    return await Deno.readFile(`${tmp}/t.wasm`);
  } finally {
    await Deno.remove(tmp, { recursive: true });
  }
};

const eq = (got: unknown, want: unknown, what: string) => {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g !== w) throw new Error(`${what}\n  want ${w}\n  got  ${g}`);
};

/** A walk over the module's sections: each id with its payload's [start, end). */
const sections = (bytes: Uint8Array) => {
  const out: { id: number; start: number; end: number }[] = [];
  let at = 8;
  const uleb = () => {
    let v = 0, shift = 0, b = 0;
    do {
      b = bytes[at++];
      v |= (b & 0x7f) << shift;
      shift += 7;
    } while (b & 0x80);
    return v;
  };
  while (at < bytes.length) {
    const id = bytes[at++];
    const len = uleb();
    out.push({ id, start: at, end: at + len });
    at += len;
  }
  return out;
};

/** The memory's limits as the module declares them — defined (section 5) or imported (section 2,
 * found as the tail of an import entry of kind 2). `null` when the module has no memory. */
const memoryLimits = (bytes: Uint8Array) => {
  let at = 0;
  const uleb = () => {
    let v = 0, shift = 0, b = 0;
    do {
      b = bytes[at++];
      v += (b & 0x7f) * 2 ** shift;
      shift += 7;
    } while (b & 0x80);
    return v;
  };
  const limits = () => {
    const flag = bytes[at++];
    const min = uleb();
    const max = flag & 1 ? uleb() : null;
    return { flag, min, max };
  };
  for (const s of sections(bytes)) {
    at = s.start;
    if (s.id === 5) {
      uleb(); // count
      return { where: "defined", ...limits() };
    }
    if (s.id === 2) {
      const n = uleb();
      for (let i = 0; i < n; i++) {
        for (let name = 0; name < 2; name++) { // module name, field name
          const len = uleb(); // read BEFORE adding: `at += uleb()` reads `at` first
          at += len;
        }
        const kind = bytes[at++];
        if (kind === 2) return { where: "imported", ...limits() };
        if (kind === 0) uleb();
        else if (kind === 1) { at++; limits(); } // table: reftype + limits
        else if (kind === 3) { at++; at++; } // global: valtype + mut (i32/f64 only here)
        else throw new Error(`unexpected import kind ${kind}`);
      }
    }
  }
  return null;
};

// A unit that writes and reads raw guest addresses — the shape a transliterated guest thread is.
const POKE = `export function put(addr: i32, v: i32) { __store_i32__(addr, v) }
export function peek(addr: i32): i32 { __load_i32__(addr) }
export function pages(): i32 { __memory_size__() }
export function grow(n: i32): i32 { __memory_grow__(n) }
`;

// ── 1. the module shape ──────────────────────────────────────────────────────

Deno.test({
  name: "shared-memory: --import-memory imports env.memory SHARED with min 1 and the given max",
  ignore: !ENABLED,
  async fn() {
    const bytes = await build(POKE, ["--import-memory", "--shared-memory=16"]);
    eq(memoryLimits(bytes), { where: "imported", flag: 3, min: 1, max: 16 }, "limits");
    if (!WebAssembly.validate(bytes as BufferSource)) throw new Error("module does not validate");
    const plain = await build(POKE, ["--import-memory"]);
    eq(memoryLimits(plain), { where: "imported", flag: 0, min: 1, max: null }, "unshared limits");
  },
});

Deno.test({
  name: "shared-memory: without --import-memory the module DEFINES a shared memory and exports it",
  ignore: !ENABLED,
  async fn() {
    const bytes = await build(POKE, ["--shared-memory=4"]);
    eq(memoryLimits(bytes), { where: "defined", flag: 3, min: 1, max: 4 }, "limits");
    const { instance } = await WebAssembly.instantiate(bytes as BufferSource, {});
    const mem = instance.exports.memory as WebAssembly.Memory;
    if (!(mem.buffer instanceof SharedArrayBuffer)) {
      throw new Error("the exported memory is not backed by a SharedArrayBuffer");
    }
  },
});

Deno.test({
  name: "shared-memory: a module that touches no linear memory is byte-identical with the flag",
  ignore: !ENABLED,
  async fn() {
    const src = "export function add(a: i32, b: i32): i32 { a + b }\n";
    eq(
      Array.from(await build(src, ["--shared-memory=8"])),
      Array.from(await build(src)),
      "no memory, nothing to share",
    );
  },
});

Deno.test({
  name: "shared-memory: -O and -O3 keep the memory shared (binaryen gets --enable-threads)",
  ignore: !ENABLED || !HAVE_OPT,
  async fn() {
    for (const rung of ["-O", "-O3"]) {
      for (const link of [[], ["--import-memory"]]) {
        const bytes = await build(POKE, [rung, "--shared-memory=16", ...link]);
        const lim = memoryLimits(bytes);
        eq(
          lim && { flag: lim.flag, max: lim.max },
          { flag: 3, max: 16 },
          `${rung} ${link.join(" ")}`,
        );
      }
    }
  },
});

// Every byte outside the memory's limits is the default build's: the flag changes the memory's
// type and nothing else, over real programs (the default path's own identity is the fixpoint's).
Deno.test({
  name: "shared-memory: over bench programs the flag moves only the memory's limits",
  ignore: !ENABLED,
  async fn() {
    const programs = [
      "bench/buffer-view-bounds/axpy-buf.vl",
      "bench/buffer-view-bounds/reduce-view.vl",
      "bench/buffer-view-bounds/rows-buf.vl",
    ];
    for (const p of programs) {
      const path = `${ROOT}/${p}`;
      const plain = await build({ path });
      const shared = await build({ path }, ["--shared-memory=256"]);
      const a = memoryLimits(plain), b = memoryLimits(shared);
      eq(a && { flag: a.flag, max: a.max }, { flag: 0, max: null }, `${p} default limits`);
      eq(b && { flag: b.flag, max: b.max }, { flag: 3, max: 256 }, `${p} shared limits`);
      // Swap the shared build's limits (03 01 80 02) for the default's (00 01): the same bytes.
      const s5 = sections(shared).find((s) => s.id === 5)!;
      const p5 = sections(plain).find((s) => s.id === 5)!;
      const back = new Uint8Array([
        ...shared.slice(0, s5.start - 1),
        ...plain.slice(p5.start - 1, p5.end),
        ...shared.slice(s5.end),
      ]);
      eq(back.length, plain.length, `${p} length once the limits are swapped back`);
      if (!back.every((x, i) => x === plain[i])) {
        throw new Error(`${p}: the shared build differs outside the memory section`);
      }
    }
  },
});

// ── 2. two Workers, one memory ───────────────────────────────────────────────

// Each worker instantiates the SAME compiled module over the memory it is handed. The writer
// stores through the guest, then raises a flag word with a JS atomic; the reader waits on the
// flag and reads the value back through ITS instance of the guest.
const WORKER_SRC = `
self.onmessage = async (e) => {
  const { module, memory, role, addr, flagAddr, value } = e.data;
  const inst = await WebAssembly.instantiate(module, { env: { memory } });
  const flags = new Int32Array(memory.buffer);
  if (role === "writer") {
    inst.exports.put(addr, value);
    Atomics.store(flags, flagAddr >> 2, 1);
    Atomics.notify(flags, flagAddr >> 2);
    self.postMessage({ done: true });
  } else {
    self.postMessage({ ready: true });
    Atomics.wait(flags, flagAddr >> 2, 0, 10000);
    self.postMessage({ got: inst.exports.peek(addr) });
  }
};
`;

Deno.test({
  name: "shared-memory: one module in two Workers over one shared memory — one writes, the other reads",
  ignore: !ENABLED,
  async fn() {
    const bytes = await build(POKE, ["--import-memory", "--shared-memory=4"]);
    const module = await WebAssembly.compile(bytes as BufferSource);
    const memory = new WebAssembly.Memory({ initial: 1, maximum: 4, shared: true });
    const url = URL.createObjectURL(new Blob([WORKER_SRC], { type: "text/javascript" }));
    const reader = new Worker(url, { type: "module" });
    const writer = new Worker(url, { type: "module" });
    const next = (w: Worker) =>
      new Promise<Record<string, unknown>>((res, rej) => {
        w.onmessage = (e) => res(e.data);
        w.onerror = (e) => {
          e.preventDefault();
          rej(new Error(e.message));
        };
      });
    try {
      const msg = { module, memory, addr: 4096, flagAddr: 64, value: 0x5eed };
      let got = next(reader);
      reader.postMessage({ ...msg, role: "reader" });
      eq(await got, { ready: true }, "reader armed");
      got = next(reader);
      const wrote = next(writer);
      writer.postMessage({ ...msg, role: "writer" });
      eq(await wrote, { done: true }, "writer finished");
      eq(await got, { got: 0x5eed }, "the reader's instance sees the writer's store");
      // And the main thread sees it too, through the same memory.
      eq(new Int32Array(memory.buffer)[4096 >> 2], 0x5eed, "main thread view");
    } finally {
      reader.terminate();
      writer.terminate();
      URL.revokeObjectURL(url);
    }
  },
});

// ── 3. growth stops at the declared max ──────────────────────────────────────

Deno.test({
  name: "shared-memory: growth is in place up to the max, and -1 past it; a JS view is not detached",
  ignore: !ENABLED,
  async fn() {
    const bytes = await build(POKE, ["--import-memory", "--shared-memory=3"]);
    const memory = new WebAssembly.Memory({ initial: 1, maximum: 3, shared: true });
    const { instance } = await WebAssembly.instantiate(bytes as BufferSource, { env: { memory } });
    const f = instance.exports as Record<string, (...a: number[]) => number>;
    const before = new Int32Array(memory.buffer);
    f.put(8, 77);
    eq(f.grow(2), 1, "grow 1 → 3 answers the old size");
    eq(f.pages(), 3, "size after growing");
    eq(f.grow(1), -1, "growing past the max answers -1");
    eq(f.pages(), 3, "a refused grow leaves the size alone");
    eq(before.length, 65536 / 4, "the old view keeps its length — a SharedArrayBuffer is not detached");
    eq(before[2], 77, "and still reads the memory");
    f.put(2 * 65536 + 16, 99);
    eq(new Int32Array(memory.buffer)[(2 * 65536 + 16) >> 2], 99, "the new page is addressable");
  },
});

// std:buffer's allocator grows the memory on demand; past the max it traps rather than handing
// out a `Buf` with no memory behind it.
const ALLOC = `import { Buffer, loadI32, storeI32 } from "std:buffer"
const a = Buffer(100000)
a.storeI32(99996, 7)
print(a.loadI32(99996))
print(__memory_size__())
const b = Buffer(200000)
print(b.length)
`;

// ── 4. the vl host ───────────────────────────────────────────────────────────

Deno.test({
  name: "shared-memory: `vl run --shared-memory` runs over a shared memory and traps past its max",
  ignore: !ENABLED,
  async fn() {
    const tmp = await Deno.makeTempDir();
    try {
      await Deno.writeTextFile(`${tmp}/a.vl`, ALLOC);
      const small = await vl(["run", "--compiler", COMPILER, "--shared-memory=3", `${tmp}/a.vl`]);
      eq(small.code, 1, `a Buffer past the max traps: ${small.err}`);
      eq(small.out.trim().split("\n"), ["7", "2"], "output before the trap");
      if (!/unreachable/.test(small.err)) throw new Error(`not a clean trap: ${small.err}`);
      const big = await vl(["run", "--compiler", COMPILER, "--shared-memory=8", `${tmp}/a.vl`]);
      eq(big.code, 0, `under a larger max it runs: ${big.err}`);
      eq(big.out.trim().split("\n"), ["7", "2", "200000"], "output");
      // A prebuilt module that defines a shared memory runs directly.
      const built = await vl(
        ["build", `${tmp}/a.vl`, "--compiler", COMPILER, "--shared-memory=8", "-o", `${tmp}/a.wasm`],
      );
      eq(built.code, 0, `build: ${built.err}`);
      const pre = await vl(["run", `${tmp}/a.wasm`]);
      eq(pre.code, 0, `prebuilt run: ${pre.err}`);
      eq(pre.out.trim().split("\n"), ["7", "2", "200000"], "prebuilt output");
    } finally {
      await Deno.remove(tmp, { recursive: true });
    }
  },
});

Deno.test({
  name: "shared-memory: a malformed --shared-memory is a usage error (exit 2) on build and run",
  ignore: !ENABLED,
  async fn() {
    const tmp = await Deno.makeTempDir();
    try {
      await Deno.writeTextFile(`${tmp}/p.vl`, POKE);
      const cases: [string[], RegExp][] = [
        [["--shared-memory"], /takes the memory's maximum after `=`/],
        [["--shared-memory=0"], /from 1 to 65536/],
        [["--shared-memory=65537"], /from 1 to 65536/],
        [["--shared-memory=x"], /from 1 to 65536/],
        [["--shared-memory=4", "--shared-memory=4"], /given twice/],
      ];
      for (const [flags, want] of cases) {
        const r = await vl(
          ["build", `${tmp}/p.vl`, "--compiler", COMPILER, "-o", `${tmp}/p.wasm`, ...flags],
        );
        eq(r.code, 2, `build ${flags.join(" ")}: ${r.err}`);
        if (!want.test(r.err)) throw new Error(`build ${flags.join(" ")}: ${r.err}`);
      }
      for (const flags of [["--shared-memory=0"], ["--shared-memory=4", "--shared-memory=4"]]) {
        const r = await vl(["run", "--compiler", COMPILER, ...flags, `${tmp}/p.vl`]);
        eq(r.code, 2, `run ${flags.join(" ")}: ${r.err}`);
      }
    } finally {
      await Deno.remove(tmp, { recursive: true });
    }
  },
});
