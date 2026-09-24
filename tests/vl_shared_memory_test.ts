// `vl build --shared-memory=<pages>` — a linear memory several instances can share.
//
// The flag declares the one memory SHARED (limits flag 0x03) with a max of <pages>, imported
// (`--import-memory`) or defined alike. It is what lets one module run in several Web Workers
// over one `WebAssembly.Memory({ shared: true })`; only the memory is shared, each instance keeps
// its own GC heap and globals. DECISIONS.md §"A shared memory is a build flag" has the rationale,
// and §"std:buffer's allocator over a shared memory" the allocator every instance shares.
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

// Every byte outside the memory's limits is the default build's, for a unit that does not
// import `std:buffer` (the default path's own identity is the fixpoint's). A unit that does
// gets the shared allocator instead, so its code differs — pinned below.
const RAW = `__store_i32__(4096, 7)
__memory_fill__(4100, 1, 4)
print(__load_i32__(4096) + __load_i32__(4100))
`;

Deno.test({
  name: "shared-memory: for a unit without std:buffer the flag moves only the memory's limits",
  ignore: !ENABLED,
  async fn() {
    for (const [what, src] of [["POKE", POKE], ["RAW", RAW]]) {
      const plain = await build(src);
      const shared = await build(src, ["--shared-memory=256"]);
      const a = memoryLimits(plain), b = memoryLimits(shared);
      eq(a && { flag: a.flag, max: a.max }, { flag: 0, max: null }, `${what} default limits`);
      eq(b && { flag: b.flag, max: b.max }, { flag: 3, max: 256 }, `${what} shared limits`);
      // Swap the shared build's limits (03 01 80 02) for the default's (00 01): the same bytes.
      const s5 = sections(shared).find((s) => s.id === 5)!;
      const p5 = sections(plain).find((s) => s.id === 5)!;
      const back = new Uint8Array([
        ...shared.slice(0, s5.start - 1),
        ...plain.slice(p5.start - 1, p5.end),
        ...shared.slice(s5.end),
      ]);
      eq(back.length, plain.length, `${what} length once the limits are swapped back`);
      if (!back.every((x, i) => x === plain[i])) {
        throw new Error(`${what}: the shared build differs outside the memory section`);
      }
    }
  },
});

// The shared allocator is decided by the build: a default build of a unit that allocates
// carries no atomic at all, a shared build allocates through them.
const WASM_DIS = `${ROOT}/node_modules/.bin/wasm-dis`;
Deno.test({
  name: "shared-memory: only a shared build allocates with atomics",
  ignore: !ENABLED || !exists(WASM_DIS),
  async fn() {
    const src = `import { Buffer } from "std:buffer"
print(Buffer(16).base)
`;
    const atomics = async (bytes: Uint8Array) => {
      const tmp = await Deno.makeTempDir();
      try {
        await Deno.writeFile(`${tmp}/m.wasm`, bytes);
        const { stdout } = await new Deno.Command(WASM_DIS, {
          args: [`${tmp}/m.wasm`, "--enable-threads", "--enable-gc", "--enable-reference-types"],
          stdout: "piped",
        }).output();
        return (dec.decode(stdout).match(/\bi64\.atomic\.[a-z.0-9_]+/g) ?? []).sort();
      } finally {
        await Deno.remove(tmp, { recursive: true });
      }
    };
    eq(await atomics(await build(src)), [], "default build");
    const shared = await atomics(await build(src, ["--shared-memory=16"]));
    if (!shared.includes("i64.atomic.load") || !shared.includes("i64.atomic.rmw.cmpxchg")) {
      throw new Error(`the shared build does not allocate atomically: ${shared.join(" ")}`);
    }
  },
});

// ── 2. two Workers, one memory ───────────────────────────────────────────────

// One module, two instances, the reviewer's ordering: A writes and allocates, THEN B
// instantiates. VL emits no data segment, so B's instantiation writes nothing and A's plain
// stores survive; B reads them through its own instance. The `std:buffer` bump pointer lives in
// the shared memory, so B's first `Buffer` lands after A's (DECISIONS.md, "std:buffer's
// allocator over a shared memory").
//
// `fill` stamps every word of a new `Buf`; `stress` makes `count` of them back to back and
// answers where its record of them starts (the bases, then the lengths, in a `Buf` of its own).
const TWO = `import { Buffer, Buf, bufferMark, bufferRelease, storeI32 } from "std:buffer"
let bumps = 0
export function put(addr: i32, v: i32) { __store_i32__(addr, v) }
export function peek(addr: i32): i32 { __load_i32__(addr) }
function fill(n: i32, stamp: i32): Buf {
  const b = Buffer(n)
  let off = 0
  while off + 4 <= n {
    b.storeI32(off, stamp)
    off = off + 4
  }
  b
}
export function alloc(n: i32, stamp: i32): i32 { fill(n, stamp).base }
export function mark(): i32 { bufferMark() }
export function release(m: i32) { bufferRelease(m) }
export function stress(count: i32, stamp: i32): i32 {
  const rec = Buffer(count * 8)
  let i = 0
  while i < count {
    const n = 4 + ((i * 7 + stamp) & 31) * 4
    const b = fill(n, stamp + i)
    rec.storeI32(i * 4, b.base)
    rec.storeI32(count * 4 + i * 4, n)
    i = i + 1
  }
  rec.base
}
export function bump(): i32 {
  bumps = bumps + 1
  bumps
}
`;

// Each worker instantiates the SAME compiled module over the memory it is handed, then runs
// one export per message. `wait` blocks on a flag word with `Atomics.wait` — JS atomics only;
// `stress` and `flood` wait on the start flag first, so every worker allocates at once.
const WORKER_SRC = `
let inst, mem;
self.onmessage = async (e) => {
  const { op, module, memory, a, b, c } = e.data;
  if (op === "init") {
    mem = memory;
    const imports = new Proxy({}, { get: () => () => {} });
    inst = await WebAssembly.instantiate(module, { env: { memory }, imports });
    self.postMessage({ ok: true });
    return;
  }
  const x = inst.exports;
  const go = () => Atomics.wait(new Int32Array(mem.buffer), c >> 2, 0, 10000);
  if (op === "put") { x.put(a, b); self.postMessage({ ok: true }); }
  if (op === "peek") self.postMessage({ v: x.peek(a) });
  if (op === "alloc") self.postMessage({ v: x.alloc(a, b) });
  if (op === "mark") self.postMessage({ v: x.mark() });
  if (op === "release") { x.release(a); self.postMessage({ ok: true }); }
  if (op === "bump") self.postMessage({ v: x.bump() });
  if (op === "stress") { go(); self.postMessage({ v: x.stress(a, b) }); }
  if (op === "flood") {
    go();
    const bases = [];
    let err = "";
    try {
      for (;;) bases.push(x.alloc(a, b + bases.length));
    } catch (t) { err = String(t); }
    // The shared pointer just after this worker's trap (header low word + heap + 8).
    const after = 1024 + 8 + new Int32Array(mem.buffer)[1024 >> 2];
    self.postMessage({ v: bases, err, after });
  }
  if (op === "wait") {
    const flags = new Int32Array(mem.buffer);
    Atomics.wait(flags, a >> 2, 0, 10000);
    self.postMessage({ v: x.peek(b) });
  }
};
`;

type Call = (w: Worker, m: Record<string, unknown>) => Promise<Record<string, unknown>>;

/** `n` Workers over one module and one memory, torn down after `body`. */
const withWorkers = async (
  n: number,
  bytes: Uint8Array,
  memory: WebAssembly.Memory,
  body: (ws: Worker[], call: Call) => Promise<void>,
) => {
  const module = await WebAssembly.compile(bytes as BufferSource);
  const url = URL.createObjectURL(new Blob([WORKER_SRC], { type: "text/javascript" }));
  const ws = Array.from({ length: n }, () => new Worker(url, { type: "module" }));
  const call: Call = (w, m) =>
    new Promise((res, rej) => {
      w.onmessage = (e) => res(e.data);
      w.onerror = (e) => {
        e.preventDefault();
        rej(new Error(e.message));
      };
      w.postMessage(m);
    });
  try {
    for (const w of ws) await call(w, { op: "init", module, memory });
    await body(ws, call);
  } finally {
    for (const w of ws) w.terminate();
    URL.revokeObjectURL(url);
  }
};

// The start flag the racing workers wait on: below the heap, which starts at 1024. The
// shared allocator's header is the heap's first 8 bytes; its low word is the bytes handed out.
const GO = 64;
const HEAP = 1024;
const start = (memory: WebAssembly.Memory) => {
  const v = new Int32Array(memory.buffer);
  Atomics.store(v, GO >> 2, 1);
  Atomics.notify(v, GO >> 2);
};
const pointer = (memory: WebAssembly.Memory) =>
  HEAP + 8 + new Int32Array(memory.buffer)[HEAP >> 2];

/** Every extent (its length rounded up to 8, as `Buffer` does) is disjoint from the others. */
const disjoint = (xs: { base: number; n: number }[], what: string) => {
  const sorted = xs.map((x) => [x.base, x.base + ((x.n + 7) & ~7)]).sort((p, q) => p[0] - q[0]);
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i][0] < sorted[i - 1][1]) {
      throw new Error(`${what}: [${sorted[i - 1]}) overlaps [${sorted[i]})`);
    }
  }
  return sorted.length ? sorted[sorted.length - 1][1] : 0;
};

Deno.test({
  name: "shared-memory: one module in two Workers — B instantiated after A keeps A's writes, and allocates past A's Buffer",
  ignore: !ENABLED,
  async fn() {
    const bytes = await build(TWO, ["--import-memory", "--shared-memory=16"]);
    const memory = new WebAssembly.Memory({ initial: 1, maximum: 16, shared: true });
    await withWorkers(1, bytes, memory, async ([A], call) => {
      const v = async (w: Worker, m: Record<string, unknown>) => (await call(w, m)).v;
      // A writes low (where a data segment would sit) and allocates, before B exists.
      await call(A, { op: "put", a: 16, b: 0x1111 });
      await call(A, { op: "put", a: 512, b: 0x2222 });
      const aAddr = await v(A, { op: "alloc", a: 64, b: 0xaaaa }) as number;
      eq([await v(A, { op: "bump" }), await v(A, { op: "bump" })], [1, 2], "A's own global");
      const view = new Int32Array(memory.buffer);
      eq(view[aAddr >> 2], 0xaaaa, "A's stamp");

      await withWorkers(1, bytes, memory, async ([B]) => {
        eq([view[16 >> 2], view[512 >> 2]], [0x1111, 0x2222], "A's plain writes survive B's instantiation");
        eq(view[aAddr >> 2], 0xaaaa, "A's allocation survives B's instantiation");
        eq(await v(B, { op: "peek", a: 512 }), 0x2222, "B's instance reads A's store");
        eq(await v(B, { op: "bump" }), 1, "B's globals are its own");

        // The allocator is shared: B's first Buffer starts where A's ended.
        const bAddr = await v(B, { op: "alloc", a: 64, b: 0xbbbb }) as number;
        eq(bAddr, aAddr + 64, "B's first Buffer follows A's");
        eq(Array.from(new Int32Array(memory.buffer, aAddr, 16)), Array(16).fill(0xaaaa), "A's stamps are intact");
        eq(view[bAddr >> 2], 0xbbbb, "B's stamp");

        // A cross-worker handoff through plain stores: B blocks, A writes and signals.
        const got = v(B, { op: "wait", a: GO, b: 4096 });
        await call(A, { op: "put", a: 4096, b: 0x5eed });
        Atomics.store(view, GO >> 2, 1);
        Atomics.notify(view, GO >> 2);
        eq(await got, 0x5eed, "B sees A's store after the signal");
      });
    });
  },
});

// A release reclaims only the releasing instance's own allocations at the top.
Deno.test({
  name: "shared-memory: bufferRelease keeps another instance's allocation, and reclaims an instance's own",
  ignore: !ENABLED,
  async fn() {
    const bytes = await build(TWO, ["--import-memory", "--shared-memory=16"]);
    const memory = new WebAssembly.Memory({ initial: 1, maximum: 16, shared: true });
    await withWorkers(2, bytes, memory, async ([A, B], call) => {
      const v = async (w: Worker, m: Record<string, unknown>) => (await call(w, m)).v as number;
      const view = () => new Int32Array(memory.buffer);
      // A's temporaries with B's allocation between them: A cannot rewind past it.
      const m0 = await v(A, { op: "mark" });
      eq(m0, HEAP + 8, "the first Buf follows the header");
      const a1 = await v(A, { op: "alloc", a: 32, b: 0xa1 });
      const b1 = await v(B, { op: "alloc", a: 32, b: 0xb1 });
      const a2 = await v(A, { op: "alloc", a: 32, b: 0xa2 });
      eq([a1, b1, a2], [m0, m0 + 32, m0 + 64], "interleaved, back to back");
      await call(A, { op: "release", a: m0 });
      eq(await v(A, { op: "mark" }), m0 + 96, "A's release kept everything — B's Buf is in the range");
      // B cannot rewind A's allocation above its own either.
      await call(B, { op: "release", a: b1 });
      eq(await v(B, { op: "mark" }), m0 + 96, "B's release kept A's top allocation");
      // A's own run at the top goes, and the next Buf reuses it.
      const m1 = await v(A, { op: "mark" });
      await v(A, { op: "alloc", a: 48, b: 0xa3 });
      await v(A, { op: "alloc", a: 16, b: 0xa4 });
      await call(A, { op: "release", a: m1 });
      eq(await v(A, { op: "mark" }), m1, "A reclaimed its own run");
      eq(await v(B, { op: "alloc", a: 8, b: 0xb2 }), m1, "the next Buf reuses it");
      eq([view()[a1 >> 2], view()[b1 >> 2], view()[a2 >> 2]], [0xa1, 0xb1, 0xa2], "nothing live was touched");
    });
  },
});

Deno.test({
  name: "shared-memory: 2, 3 and 4 Workers × 10,000 concurrent Buffers — no two overlap and every stamp survives",
  ignore: !ENABLED,
  async fn() {
    const bytes = await build(TWO, ["--import-memory", "--shared-memory=256"]);
    const COUNT = 10000;
    for (const n of [2, 3, 4]) {
      const memory = new WebAssembly.Memory({ initial: 1, maximum: 256, shared: true });
      await withWorkers(n, bytes, memory, async (ws, call) => {
        const runs = ws.map((w, k) => call(w, { op: "stress", a: COUNT, b: (k + 1) << 24, c: GO }));
        start(memory);
        const recs = (await Promise.all(runs)).map((r) => r.v as number);
        const view = new Int32Array(memory.buffer);
        const all: { base: number; n: number }[] = [];
        recs.forEach((rec, k) => {
          const stamp0 = (k + 1) << 24;
          all.push({ base: rec, n: COUNT * 8 });
          for (let i = 0; i < COUNT; i++) {
            const base = view[(rec >> 2) + i], len = view[(rec >> 2) + COUNT + i];
            all.push({ base, n: len });
            for (let w = 0; w < len; w += 4) {
              if (view[(base + w) >> 2] !== stamp0 + i) {
                throw new Error(
                  `${n} workers: worker ${k} Buf ${i} at ${base}: word ${w} is ${view[(base + w) >> 2]}`,
                );
              }
            }
          }
        });
        eq(all.length, n * (COUNT + 1), `${n} workers: every allocation is accounted for`);
        const end = disjoint(all, `${n} workers`);
        // Nothing was handed out twice or skipped: the Bufs tile the heap up to the pointer.
        eq(pointer(memory), end, `${n} workers: the shared pointer ends at the last Buf`);
        eq(
          all.reduce((t, x) => t + ((x.n + 7) & ~7), 0),
          end - HEAP - 8,
          `${n} workers: the Bufs tile the heap`,
        );
        const pages = memory.buffer.byteLength / 65536;
        if (pages < Math.ceil(end / 65536) || pages > 256) {
          throw new Error(`${n} workers: the memory is ${pages} pages for a pointer at ${end}`);
        }
      });
    }
  },
});

Deno.test({
  name: "shared-memory: Workers racing to grow up to the max each trap only when it is full, and lose nothing",
  ignore: !ENABLED,
  async fn() {
    // Two Bufs to a page and a small max, so the workers race for nearly every page and for
    // the last one; a round is cheap, so run many, each over a fresh memory.
    const MAX = 6;
    const SIZE = 30000;
    const ROUNDS = 30;
    const bytes = await build(TWO, ["--import-memory", `--shared-memory=${MAX}`]);
    const module = await WebAssembly.compile(bytes as BufferSource);
    const fresh = () => new WebAssembly.Memory({ initial: 1, maximum: MAX, shared: true });
    await withWorkers(4, bytes, fresh(), async (ws, call) => {
      for (let round = 0; round < ROUNDS; round++) {
        const memory = fresh();
        for (const w of ws) await call(w, { op: "init", module, memory });
        const runs = ws.map((w, k) => call(w, { op: "flood", a: SIZE, b: (k + 1) << 24, c: GO }));
        start(memory);
        const outs = await Promise.all(runs);
        const view = new Int32Array(memory.buffer);
        const all: { base: number; n: number }[] = [];
        outs.forEach((o, k) => {
          if (!/unreachable/.test(o.err as string)) {
            throw new Error(`round ${round}: worker ${k} did not trap cleanly: ${o.err}`);
          }
          // A trap is the max refusing, never a lost race: even read after the trap, the
          // pointer leaves no room for the Buf the worker asked for.
          if (MAX * 65536 - (o.after as number) >= SIZE) {
            throw new Error(`round ${round}: worker ${k} trapped with room left (pointer ${o.after})`);
          }
          (o.v as number[]).forEach((base, i) => {
            all.push({ base, n: SIZE });
            for (let w = 0; w + 4 <= SIZE; w += 4) {
              if (view[(base + w) >> 2] !== ((k + 1) << 24) + i) {
                throw new Error(`round ${round}: worker ${k} Buf ${i} at ${base}: word ${w} was overwritten`);
              }
            }
          });
        });
        const end = disjoint(all, `round ${round}`);
        eq(memory.buffer.byteLength, MAX * 65536, `round ${round}: grown to the max, and no further`);
        // A refused growth claims nothing: the pointer ends at the last Buf handed out.
        eq(pointer(memory), end, `round ${round}: no Buf was claimed past the max`);
        eq(all.length, Math.floor((MAX * 65536 - HEAP - 8) / SIZE), `round ${round}: every Buf that fits`);
      }
    });
  },
});

Deno.test({
  name: "shared-memory: --import-memory --shared-memory does not warn — instances share one allocator",
  ignore: !ENABLED,
  async fn() {
    const tmp = await Deno.makeTempDir();
    try {
      await Deno.writeTextFile(`${tmp}/two.vl`, TWO);
      const warn = async (flags: string[]) => {
        const r = await vl(
          ["build", `${tmp}/two.vl`, "--compiler", COMPILER, "-o", `${tmp}/o.wasm`, ...flags],
        );
        eq(r.code, 0, `build ${flags.join(" ")}: ${r.err}`);
        return r.err.split("\n").filter((l) => l.includes("warning")).join("\n");
      };
      eq(await warn(["--import-memory", "--shared-memory=16"]), "", "shared, no window");
      eq(await warn(["--shared-memory=16"]), "", "a defined memory");
      // The unshared hazard between separately built units is unchanged.
      if (!/no --heap-base/.test(await warn(["--import-memory"]))) {
        throw new Error("an unshared --import-memory unit that allocates should still warn");
      }
    } finally {
      await Deno.remove(tmp, { recursive: true });
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

// The build decides `__memory_shared__()`: the corpus fixture pins the default face, this the
// shared one — the folded `if`s run their bodies, and the `if`/`else` takes its first arm.
Deno.test({
  name: "shared-memory: __memory_shared__() is true in a shared build, at every folded site",
  ignore: !ENABLED,
  async fn() {
    const fixture = `${ROOT}/tests/cases/memory/memory-shared-default-build.vl`;
    const plain = await vl(["run", "--compiler", COMPILER, fixture]);
    eq(plain.out.trim().split("\n"), ["false", "1", "2", "3"], `default build: ${plain.err}`);
    const shared = await vl(["run", "--compiler", COMPILER, "--shared-memory=2", fixture]);
    eq(shared.out.trim().split("\n"), ["true", "100", "100", "11", "100"], `shared build: ${shared.err}`);
  },
});

// std:buffer's allocator grows the memory on demand; past the max it traps rather than handing
// out a `Buf` with no memory behind it.
const ALLOC =`import { Buffer, loadI32, storeI32 } from "std:buffer"
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
        [["--shared-memory=+16"], /from 1 to 65536/],
        [["--shared-memory=1_6"], /from 1 to 65536/],
        [["--shared-memory="], /from 1 to 65536/],
        [["--shared-memory=4", "--shared-memory=4"], /given twice/],
      ];
      for (const [flags, want] of cases) {
        const r = await vl(
          ["build", `${tmp}/p.vl`, "--compiler", COMPILER, "-o", `${tmp}/p.wasm`, ...flags],
        );
        eq(r.code, 2, `build ${flags.join(" ")}: ${r.err}`);
        if (!want.test(r.err) || !r.err.startsWith("vl build:")) {
          throw new Error(`build ${flags.join(" ")}: ${r.err}`);
        }
      }
      // `vl run` speaks as itself, and a bare flag is named rather than "unknown".
      for (const [flags, want] of cases) {
        const r = await vl(["run", "--compiler", COMPILER, ...flags, `${tmp}/p.vl`]);
        eq(r.code, 2, `run ${flags.join(" ")}: ${r.err}`);
        if (!want.test(r.err) || !r.err.startsWith("vl run:")) {
          throw new Error(`run ${flags.join(" ")}: ${r.err}`);
        }
      }
      // A prebuilt module's memory is already declared: the flag is refused, not ignored.
      const plain = await vl(
        ["build", `${tmp}/p.vl`, "--compiler", COMPILER, "-o", `${tmp}/p.wasm`],
      );
      eq(plain.code, 0, `plain build: ${plain.err}`);
      const pre = await vl(["run", "--shared-memory=4", `${tmp}/p.wasm`]);
      eq(pre.code, 2, `run --shared-memory on a prebuilt module: ${pre.err}`);
      if (!/already built/.test(pre.err)) throw new Error(`prebuilt refusal: ${pre.err}`);
    } finally {
      await Deno.remove(tmp, { recursive: true });
    }
  },
});
