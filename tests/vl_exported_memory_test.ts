// EXPORTED LINEAR MEMORY (webcraft P0.2) — proved from the HOST side.
//
// Everything else about the memory tier can be pinned inside the guest with a
// corpus case. This cannot: the whole point of P0.2 is that a JS host overlays a
// typed-array view on `instance.exports.memory.buffer` and reads, in place, bytes
// the VL program wrote — no copy, no accessor call per element. A test that never
// leaves the guest does not demonstrate that, so this suite instantiates through
// the real host adapter (`tests/support/runWasm.ts`) and reads the memory.
//
// It also pins the DETACHMENT hazard head-on. `memory.grow` detaches every view
// previously taken on `.buffer`; a detached typed array reports `byteLength === 0`
// and an indexed read of it yields `undefined` RATHER THAN THROWING. Exporting the
// memory (P0.2) and reaching `memory.grow` (S4) are each harmless and together are
// a silent-wrong-answer channel, so the behaviour is asserted here rather than
// described in a comment somewhere. See `docs/internals/buffer-design.md` §B5.
//
// GATING mirrors the other native suites: needs the `vl` binary + the seed wasm,
// and registers ignored with a build note when either is missing. It is NOT gated
// on SELFHOST_NATIVE_ALIGN — it asserts emitted-module SHAPE and host-visible
// behaviour, not native/JS byte alignment.
//
// The `vl_` prefix is load-bearing: it is one of the two globs the `ci-native`
// job auto-discovers, and a seed-backed test matching neither glob nor an
// explicit ci.yml step runs NOWHERE in CI (it self-ignores in the seedless `ci`
// job). `tests/ci_seed_coverage_test.ts` is the guard that enforces this, and it
// caught this file under its original name.

const exists = (p: string): boolean => {
  try {
    Deno.statSync(p);
    return true;
  } catch {
    return false;
  }
};

const ROOT = new URL("../", import.meta.url).pathname.replace(/\/$/, "");
const VL = `${ROOT}/scripts/vl-host/target/release/vl`;
const COMPILER = `${ROOT}/build/vl-compiler.wasm`;

const haveBin = exists(VL);
const haveSeed = exists(COMPILER);
const ENABLED = haveBin && haveSeed;
if (!ENABLED) {
  console.warn(
    `[exported-memory] skipped — ${
      !haveBin ? "missing vl binary" : "missing seed wasm"
    }. Build:\n` +
      "  (cd scripts/vl-host && cargo build --release)\n" +
      "  scripts/refresh-compiler.sh",
  );
}

const { runWasm } = await import("./support/runWasm.ts");

/** Compile VL source to wasm bytes through the native tool (the real pipeline). */
const build = async (src: string): Promise<Uint8Array> => {
  const tmp = await Deno.makeTempDir();
  try {
    const f = `${tmp}/t.vl`;
    const o = `${tmp}/t.wasm`;
    await Deno.writeTextFile(f, src);
    const { code, stderr } = await new Deno.Command(VL, {
      args: ["build", f, "-o", o, "--compiler", COMPILER],
      stdout: "piped",
      stderr: "piped",
    }).output();
    if (code !== 0) {
      throw new Error(
        `vl build failed: ${new TextDecoder().decode(stderr).trim()}`,
      );
    }
    return await Deno.readFile(o);
  } finally {
    await Deno.remove(tmp, { recursive: true });
  }
};

const assertEq = (got: unknown, want: unknown, what: string) => {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g !== w) throw new Error(`${what}\n  want ${w}\n  got  ${g}`);
};

// ── 1. the export exists, and it is a MEMORY ─────────────────────────────────

Deno.test({
  name: "exported-memory: a memory-using module exports `memory` as a WebAssembly.Memory",
  ignore: !ENABLED,
  fn: async () => {
    const { exports } = await runWasm(
      await build(`__store_i32__(0, 1)\nprint(__load_i32__(0))\n`),
    );
    if (!(exports.memory instanceof WebAssembly.Memory)) {
      throw new Error(
        `exports.memory is ${
          exports.memory === undefined ? "absent" : typeof exports.memory
        }, expected a WebAssembly.Memory`,
      );
    }
    assertEq(
      (exports.memory as WebAssembly.Memory).buffer.byteLength,
      65536,
      "the exported memory starts at one 64 KiB page",
    );
  },
});

Deno.test({
  name: "exported-memory: a module that never touches memory exports NO `memory`",
  ignore: !ENABLED,
  fn: async () => {
    // The gate: the memory export rides the same `memUsed` flag as the memory
    // SECTION, so a memory-free program is unchanged by P0.2.
    const { exports, logs } = await runWasm(
      await build(`export function add(a: i32, b: i32): i32 { a + b }\nprint(add(2, 3))\n`),
    );
    assertEq(logs, ["5"], "the program still runs");
    if (exports.memory !== undefined) {
      throw new Error("a memory-free module exported a `memory` — the gate leaked");
    }
    if (typeof exports.add !== "function") {
      throw new Error("the function export went missing");
    }
  },
});

// ── 2. THE POINT: the host reads bytes the guest wrote, in place ─────────────

Deno.test({
  name: "exported-memory: host overlays views and reads bytes VL wrote (no copy)",
  ignore: !ENABLED,
  fn: async () => {
    // The guest writes a small header of i32 words, then an f32 column — the
    // shape webcraft's render-publish path wants to read without marshalling.
    // f32 1.0 / 1.5 / -2.25 / 0.5 as raw bit patterns, laid down by i32 stores.
    // (-2.25 is 0xC0100000, whose top bit is set: a VL integer literal takes the
    // NARROWEST type that holds it exactly, so the hex spelling would be an i64
    // and `__store_i32__` would reject it. Spelled as the signed i32 it is.)
    const { exports } = await runWasm(await build(`
__store_i32__(0, 0x0000BEEF)
__store_i32__(4, 4)
__store_i32__(16, 0x3F800000)
__store_i32__(20, 0x3FC00000)
__store_i32__(24, -1072693248)
__store_i32__(28, 0x3F000000)
print(__load_i32__(0))
`));
    const mem = exports.memory as WebAssembly.Memory;

    // (a) a DataView over the header
    const dv = new DataView(mem.buffer);
    assertEq(dv.getUint32(0, true), 0xBEEF, "host reads the guest's magic word");
    assertEq(dv.getUint32(4, true), 4, "host reads the guest's count word");

    // (b) a Float32Array overlaid ON the same bytes — the zero-copy read
    const col = new Float32Array(mem.buffer, 16, 4);
    assertEq([...col], [1, 1.5, -2.25, 0.5], "host reads the f32 column in place");

    // (c) byte-level agreement: the little-endian bytes of 0x3FC00000 at 20..23
    const u8 = new Uint8Array(mem.buffer, 20, 4);
    assertEq([...u8], [0x00, 0x00, 0xC0, 0x3F], "host sees the exact bytes");

    // (d) it really is ONE buffer, not a copy: writing through the host view is
    //     visible to a subsequent host read of a different view over the memory.
    col[0] = 7.5;
    assertEq(
      new DataView(mem.buffer).getFloat32(16, true),
      7.5,
      "the host's write lands in the same memory",
    );
  },
});

Deno.test({
  name: "exported-memory: guest and host agree across an exported function call",
  ignore: !ENABLED,
  fn: async () => {
    // The full round trip a consumer actually performs: host writes into the
    // exported memory, calls an exported guest function that reads those bytes
    // at a narrow width, and reads the guest's answer back out of memory.
    const { exports } = await runWasm(await build(`
export function sumBytes(base: i32, n: i32): i32 {
  let total = 0
  let i = 0
  while i < n {
    total = total + __load_u8__(base + i)
    i = i + 1
  }
  __store_i32__(1024, total)
  total
}
`));
    const mem = exports.memory as WebAssembly.Memory;
    const bytes = new Uint8Array(mem.buffer, 64, 5);
    bytes.set([1, 2, 3, 250, 255]);

    const got = (exports.sumBytes as (b: number, n: number) => number)(64, 5);
    assertEq(got, 1 + 2 + 3 + 250 + 255, "the guest read the host's bytes UNSIGNED");
    assertEq(
      new DataView(mem.buffer).getInt32(1024, true),
      511,
      "the host reads the guest's answer back out of memory",
    );
  },
});

// ── 3. THE DETACHMENT HAZARD, asserted rather than described ────────────────

Deno.test({
  name: "exported-memory: memory.grow DETACHES host views — silently, byteLength 0 and undefined reads",
  ignore: !ENABLED,
  fn: async () => {
    const { exports } = await runWasm(await build(`
export function grow(pages: i32): i32 { __memory_grow__(pages) }
export function pages(): i32 { __memory_size__() }
__store_i32__(0, 11223344)
print(__load_i32__(0))
`));
    const mem = exports.memory as WebAssembly.Memory;

    const stale = new Int32Array(mem.buffer);
    assertEq(stale.length, 16384, "a one-page view holds 16384 i32 slots");
    assertEq(stale[0], 11223344, "the host reads the value the guest stored");

    const prev = (exports.grow as (p: number) => number)(15);
    assertEq(prev, 1, "memory.grow returns the PREVIOUS page count");
    assertEq((exports.pages as () => number)(), 16, "the memory is now 16 pages");

    // THE HAZARD. Not a throw — a zero length and an `undefined` element.
    assertEq(stale.byteLength, 0, "the old view is DETACHED (byteLength 0)");
    assertEq(stale[0], undefined, "a detached read yields undefined, NOT a throw");

    // The guest's data is fine; only the host's window onto it died.
    const fresh = new Int32Array(mem.buffer);
    assertEq(fresh.length, 16384 * 16, "a fresh view spans all 16 pages");
    assertEq(fresh[0], 11223344, "the guest's bytes survived the growth");

    // THE CONTRACT, stated as a test: re-read `.buffer` after any call that can
    // grow. A host that caches a view across a guest call reads `undefined`.
    assertEq(
      new DataView(mem.buffer).getInt32(0, true),
      11223344,
      "re-deriving the view after the call is the correct pattern",
    );
  },
});

Deno.test({
  name: "exported-memory: a failed grow returns -1 and leaves views attached",
  ignore: !ENABLED,
  fn: async () => {
    const { exports } = await runWasm(await build(`
export function grow(pages: i32): i32 { __memory_grow__(pages) }
__store_i32__(0, 4242)
print(__load_i32__(0))
`));
    const mem = exports.memory as WebAssembly.Memory;
    const view = new Int32Array(mem.buffer);
    // 70000 pages exceeds the wasm32 maximum of 65536 — the grow cannot succeed.
    assertEq((exports.grow as (p: number) => number)(70000), -1, "failure returns -1");
    assertEq(view.byteLength, 65536, "a FAILED grow does not detach the view");
    assertEq(view[0], 4242, "and the bytes are untouched");
  },
});
