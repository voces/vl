// One VL module in several Workers over one shared memory: the band-sum pattern in
// `docs/guide/workers.md`, run end to end. An owner Worker calls `setup` once and `tick` per
// tick; each helper Worker blocks in `serve` on the same compiled module. Every band writes only
// its own rows and the owner combines the partial sums in band order, so the totals and the grid
// must equal a serial JS model bit for bit, for 0, 1, 2 and 3 helpers alike.
//
// Gated like the other native suites (binary + seed). The `vl_` prefix puts it in the ci-native
// glob; `vl_shared_memory_test.ts` pins the memory shape and the shared allocator.
//
// @test-timing native

import { COMPILER, exists, nativeEnv, ROOT, VL } from "./support/tree.ts";

const ENABLED = exists(VL) && exists(COMPILER);
const SRC = `${ROOT}/tests/fixtures/shared-bands/bands.vl`;
const W = 256, H = 96, BANDS = 8, TICKS = 3;

const build = async (src: string): Promise<Uint8Array> => {
  const tmp = await Deno.makeTempDir();
  try {
    const out = `${tmp}/bands.wasm`;
    const r = await new Deno.Command(VL, {
      args: [
        "build",
        src,
        "-o",
        out,
        "--compiler",
        COMPILER,
        "--import-memory",
        "--shared-memory=16",
      ],
      stdout: "piped",
      stderr: "piped",
      env: nativeEnv(),
    }).output();
    if (r.code !== 0) {
      throw new Error(`vl build failed: ${new TextDecoder().decode(r.stderr)}`);
    }
    return await Deno.readFile(out);
  } finally {
    await Deno.remove(tmp, { recursive: true });
  }
};

// Each Worker instantiates the module over the memory it is handed, then calls one export per
// message. `serve` blocks the helper inside wasm until the owner's `stop`.
const WORKER_SRC = `
let x;
self.onmessage = async (e) => {
  const { op, module, memory, fn, args } = e.data;
  try {
    if (op === "init") {
      const imports = new Proxy({}, { get: () => () => {} });
      x = (await WebAssembly.instantiate(module, { env: { memory }, imports })).exports;
      self.postMessage({ v: null });
    } else {
      self.postMessage({ v: x[fn](...args) });
    }
  } catch (t) {
    self.postMessage({ err: String(t) });
  }
};
`;

type Reply = { v?: unknown; err?: string };

const call = (w: Worker, m: Record<string, unknown>): Promise<unknown> =>
  new Promise((res, rej) => {
    w.onmessage = (e: MessageEvent<Reply>) =>
      e.data.err !== undefined ? rej(new Error(e.data.err)) : res(e.data.v);
    w.onerror = (e) => {
      e.preventDefault();
      rej(new Error(e.message));
    };
    w.postMessage(m);
  });

/** The serial model: the same f32 regrowth and f64 band sums, combined in band order. */
const model = () => {
  const grid = new Float32Array(W * H);
  const totals: number[] = [];
  for (let t = 1; t <= TICKS; t++) {
    let total = 0;
    for (let b = 0; b < BANDS; b++) {
      let sum = 0;
      for (
        let y = Math.floor(b * H / BANDS);
        y < Math.floor((b + 1) * H / BANDS);
        y++
      ) {
        for (let x = 0; x < W; x++) {
          const grow = (x * 31 + y * 17 + t) & 15;
          const v = Math.fround(Math.fround(grid[y * W + x] * 0.75) + grow);
          grid[y * W + x] = v;
          sum += v;
        }
      }
      total += sum;
    }
    totals.push(total);
  }
  return { grid, totals };
};

/** Run TICKS ticks with one owner and `helpers` helper Workers; answer the totals and grid. */
const runBands = async (module: WebAssembly.Module, helpers: number) => {
  const memory = new WebAssembly.Memory({
    initial: 1,
    maximum: 16,
    shared: true,
  });
  const url = URL.createObjectURL(
    new Blob([WORKER_SRC], { type: "text/javascript" }),
  );
  const ws = Array.from(
    { length: helpers + 1 },
    () => new Worker(url, { type: "module" }),
  );
  const [owner, ...rest] = ws;
  let timer = 0;
  const deadline = new Promise<never>((_, rej) => {
    timer = setTimeout(
      () => rej(new Error(`${helpers} helpers: no result in 60 s`)),
      60_000,
    );
  });
  try {
    const work = async () => {
      for (const w of ws) await call(w, { op: "init", module, memory });
      const ctl = await call(owner, {
        op: "call",
        fn: "setup",
        args: [W, H, BANDS],
      }) as number;
      const served = rest.map((w) =>
        call(w, { op: "call", fn: "serve", args: [ctl] })
      );
      const totals: number[] = [];
      for (let t = 1; t <= TICKS; t++) {
        totals.push(
          await call(owner, {
            op: "call",
            fn: "tick",
            args: [ctl, t],
          }) as number,
        );
      }
      await call(owner, { op: "call", fn: "stop", args: [ctl] });
      const seen = await Promise.all(served) as number[];
      for (const s of seen) {
        if (s < 0 || s > TICKS) {
          throw new Error(`a helper saw ${s} ticks of ${TICKS}`);
        }
      }
      const gridBase = new Int32Array(memory.buffer)[(ctl + 28) >> 2];
      return {
        totals,
        grid: new Float32Array(
          memory.buffer.slice(gridBase, gridBase + W * H * 4),
        ),
      };
    };
    return await Promise.race([work(), deadline]);
  } finally {
    clearTimeout(timer);
    for (const w of ws) w.terminate();
    URL.revokeObjectURL(url);
  }
};

Deno.test({
  name:
    "shared-memory bands: one module in an owner and 0..3 helper Workers sums every band deterministically",
  ignore: !ENABLED,
  async fn() {
    const module = await WebAssembly.compile(await build(SRC) as BufferSource);
    const want = model();
    for (const helpers of [2, 0, 1, 3]) {
      const got = await runBands(module, helpers);
      for (let t = 0; t < TICKS; t++) {
        if (!Object.is(got.totals[t], want.totals[t])) {
          throw new Error(
            `${helpers} helpers, tick ${t + 1}: total\n  want ${
              want.totals[t]
            }\n  got  ${got.totals[t]}`,
          );
        }
      }
      for (let i = 0; i < W * H; i++) {
        if (!Object.is(got.grid[i], want.grid[i])) {
          throw new Error(
            `${helpers} helpers: cell ${i}\n  want ${want.grid[i]}\n  got  ${
              got.grid[i]
            }`,
          );
        }
      }
    }
  },
});

// The guide's first answer: top-level code is the module's start function, so it runs once in
// EVERY instance — here it bumps a shared word and allocates — while what one instance wrote to
// the shared memory survives the next one's instantiation (VL emits no active data segment).
const START = `import { Buffer } from "std:buffer"
const hits = __atomic_rmw_add_i32__(64, 1)
const top = Buffer(16)
export function startHits(): i32 { return hits }
export function topBase(): i32 { return top.base }
`;

Deno.test({
  name:
    "shared-memory bands: top-level code runs in every instance, and leaves the shared memory's other bytes alone",
  ignore: !ENABLED,
  async fn() {
    const tmp = await Deno.makeTempDir();
    try {
      await Deno.writeTextFile(`${tmp}/start.vl`, START);
      const module = await WebAssembly.compile(
        await build(`${tmp}/start.vl`) as BufferSource,
      );
      const memory = new WebAssembly.Memory({
        initial: 1,
        maximum: 16,
        shared: true,
      });
      const view = new Int32Array(memory.buffer);
      const imports = new Proxy({}, { get: () => () => {} });
      const inst = async () =>
        (await WebAssembly.instantiate(module, { env: { memory }, imports }))
          .exports as Record<
            string,
            () => number
          >;
      const a = await inst();
      view[300] = 0x5eed;
      const b = await inst();
      const got = [
        view[16],
        a.startHits(),
        b.startHits(),
        a.topBase(),
        b.topBase(),
        view[300],
      ];
      const want = [2, 0, 1, 1032, 1048, 0x5eed];
      if (JSON.stringify(got) !== JSON.stringify(want)) {
        throw new Error(
          `[word 64, hits A, hits B, top A, top B, word 1200]\n  want ${want}\n  got  ${got}`,
        );
      }
    } finally {
      await Deno.remove(tmp, { recursive: true });
    }
  },
});

// The guide's barrier, built from `std:atomic` alone: four Workers × 500 rounds, and no party
// ever passes it before every other party's write of that round is visible.
Deno.test({
  name:
    "shared-memory bands: the guide's generation barrier holds across four Workers",
  ignore: !ENABLED,
  async fn() {
    const module = await WebAssembly.compile(
      await build(
        `${ROOT}/tests/fixtures/shared-bands/barrier.vl`,
      ) as BufferSource,
    );
    const memory = new WebAssembly.Memory({
      initial: 1,
      maximum: 16,
      shared: true,
    });
    const imports = new Proxy({}, { get: () => () => {} });
    const x =
      (await WebAssembly.instantiate(module, { env: { memory }, imports }))
        .exports as Record<string, (...a: number[]) => number>;
    const N = 4, ROUNDS = 500;
    const at = x.make(), slots = x.slotsOf(N);
    const url = URL.createObjectURL(
      new Blob([WORKER_SRC], { type: "text/javascript" }),
    );
    const ws = Array.from(
      { length: N },
      () => new Worker(url, { type: "module" }),
    );
    let timer = 0;
    const deadline = new Promise<never>((_, rej) => {
      timer = setTimeout(
        () => rej(new Error("barrier: no result in 60 s")),
        60_000,
      );
    });
    try {
      const work = async () => {
        for (const w of ws) await call(w, { op: "init", module, memory });
        return await Promise.all(
          ws.map((w, me) =>
            call(w, { op: "call", fn: "run", args: [at, N, me, ROUNDS, slots] })
          ),
        );
      };
      const bad = await Promise.race([work(), deadline]);
      if (JSON.stringify(bad) !== JSON.stringify([0, 0, 0, 0])) {
        throw new Error(
          `mismatched slots per Worker\n  want [0,0,0,0]\n  got  ${
            JSON.stringify(bad)
          }`,
        );
      }
    } finally {
      clearTimeout(timer);
      for (const w of ws) w.terminate();
      URL.revokeObjectURL(url);
    }
  },
});
