// `vl build --import-memory` and the `std:buffer` heap window — proved from the HOST side.
//
// The flag exists so separately compiled units can share ONE linear memory: each
// unit imports `env.memory` instead of defining (and exporting) its own, a linker
// merges them, and one host supplies the memory. None of that is visible inside a
// guest, so this suite builds real modules, links two of them with binaryen's
// `wasm-merge`, and instantiates the result against a host-owned memory.
//
// The window (`--heap-base=` / `--heap-limit=`) is the other half: every unit that
// allocates `Buf`s starts its bump pointer at the SAME address by default, so two
// allocating units overwrite each other. The suite pins that hazard and the fix.
// DECISIONS.md §"Linear memory is a layout contract" carries the rationale.
//
// Gated like the other native suites (binary + seed); the link tests also need
// `node_modules/.bin/wasm-merge`. The `vl_` prefix puts it in the ci-native glob.
//
// @test-timing native

import { COMPILER, exists, nativeEnv, ROOT, VL } from "./support/tree.ts";

const ENABLED = exists(VL) && exists(COMPILER);
const WASM_MERGE = `${ROOT}/node_modules/.bin/wasm-merge`;
const HAVE_MERGE = exists(WASM_MERGE);
if (!ENABLED) {
  console.warn(
    "[import-memory] skipped — missing vl binary or seed wasm. Build:\n" +
      "  (cd scripts/vl-host && cargo build --release)\n" +
      "  scripts/refresh-compiler.sh",
  );
}

const dec = new TextDecoder();

/** Run the native `vl` with `args`; answers exit code and both streams. */
const vl = async (args: string[]) => {
  const { code, stdout, stderr } = await new Deno.Command(VL, {
    args,
    stdout: "piped",
    stderr: "piped",
    env: nativeEnv(),
  }).output();
  return { code, out: dec.decode(stdout), err: dec.decode(stderr) };
};

/** Build `src` with `flags`, answering the module bytes. Throws on a failed build. */
const build = async (
  src: string,
  flags: string[] = [],
): Promise<Uint8Array> => {
  const tmp = await Deno.makeTempDir();
  try {
    await Deno.writeTextFile(`${tmp}/t.vl`, src);
    const r = await vl([
      "build",
      `${tmp}/t.vl`,
      "-o",
      `${tmp}/t.wasm`,
      "--compiler",
      COMPILER,
      ...flags,
    ]);
    if (r.code !== 0) {
      throw new Error(`vl build ${flags.join(" ")} failed: ${r.err.trim()}`);
    }
    return await Deno.readFile(`${tmp}/t.wasm`);
  } finally {
    await Deno.remove(tmp, { recursive: true });
  }
};

const noop = () => {};
/** The imports a VL module may ask for, over the memory the host owns. */
const hostImports = (memory: WebAssembly.Memory) => ({
  env: { memory },
  host: { memory }, // the provider recipe's one import, after linking
  imports: {
    __print_i32__: noop,
    __print_bool__: noop,
    __print_char__: noop,
    __print_str_flush__: noop,
    __print_i64__: noop,
    __print_f64__: noop,
    __print_f32__: noop,
  },
});

type Fns = Record<string, (...a: number[]) => number>;
const instantiate = async (bytes: Uint8Array, memory: WebAssembly.Memory) => {
  const { instance } = await WebAssembly.instantiate(
    bytes as BufferSource,
    hostImports(memory),
  );
  return instance.exports as unknown as Fns & WebAssembly.Exports;
};

const eq = (got: unknown, want: unknown, what: string) => {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g !== w) throw new Error(`${what}\n  want ${w}\n  got  ${g}`);
};

const memoryShape = (bytes: Uint8Array) => {
  const m = new WebAssembly.Module(bytes as BufferSource);
  return {
    imports: WebAssembly.Module.imports(m).filter((i) => i.kind === "memory")
      .map((i) => `${i.module}.${i.name}`),
    exports: WebAssembly.Module.exports(m).filter((e) => e.kind === "memory")
      .map((e) => e.name),
  };
};

/** The ids of the module's sections, in order — enough to see a global (6) or data (11) section. */
const sectionIds = (bytes: Uint8Array): number[] => {
  const ids: number[] = [];
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
    ids.push(bytes[at++]);
    const len = uleb(); // read BEFORE adding: `at += uleb()` reads `at` first
    at += len;
  }
  return ids;
};

// A transliterated unit: pure code over guest addresses, no strings, no allocator.
const CODE_ONLY = `export function add32(p: i32, q: i32, dst: i32) {
  __store_i32__(dst, __load_i32__(p) + __load_i32__(q))
}
`;
const WRITER = `import { Buffer, storeI32 } from "std:buffer"
export function put(v: i32): i32 {
  const b = Buffer(16)
  b.storeI32(0, v)
  b.base
}
`;
const READER = `import { Buf, Buffer, loadI32, storeI32 } from "std:buffer"
export function peek(addr: i32): i32 {
  const b: Buf = { base: addr, length: 16 }
  b.loadI32(0)
}
export function own(v: i32): i32 {
  const b = Buffer(16)
  b.storeI32(0, v)
  b.base
}
`;

// ── 1. the module shape ──────────────────────────────────────────────────────

Deno.test({
  name:
    "import-memory: a memory-using module imports env.memory and neither defines nor exports one",
  ignore: !ENABLED,
  fn: async () => {
    const plain = await build(WRITER);
    eq(
      memoryShape(plain),
      { imports: [], exports: ["memory"] },
      "default build",
    );
    const imported = await build(WRITER, ["--import-memory"]);
    eq(
      memoryShape(imported),
      { imports: ["env.memory"], exports: [] },
      "--import-memory build",
    );
    // The guest writes land in the memory the HOST created.
    const memory = new WebAssembly.Memory({ initial: 1 });
    const ex = await instantiate(imported, memory);
    const at = ex.put(0x5eed);
    eq(
      new DataView(memory.buffer).getInt32(at, true),
      0x5eed,
      "host reads the guest's store",
    );
  },
});

Deno.test({
  name:
    "import-memory: a module that touches no linear memory is byte-identical with or without the flag",
  ignore: !ENABLED,
  fn: async () => {
    const src = `export function add(a: i32, b: i32): i32 { a + b }\n`;
    const a = await build(src);
    const b = await build(src, ["--import-memory"]);
    if (a.length !== b.length || a.some((x, i) => x !== b[i])) {
      throw new Error(
        `the flag changed a memory-free module (${a.length} vs ${b.length} bytes)`,
      );
    }
  },
});

Deno.test({
  name:
    "import-memory: a code-only unit is pure code over the imported memory — no globals, no data",
  ignore: !ENABLED,
  fn: async () => {
    const bytes = await build(CODE_ONLY, ["--import-memory"]);
    eq(
      memoryShape(bytes),
      { imports: ["env.memory"], exports: [] },
      "memory shape",
    );
    const ids = sectionIds(bytes);
    for (
      const [id, what] of [[5, "memory"], [6, "global"], [11, "data"]] as const
    ) {
      if (ids.includes(id)) {
        throw new Error(`a code-only unit carries a ${what} section: ${ids}`);
      }
    }
    // The window globals ride only on a unit that reads them.
    if (!sectionIds(await build(WRITER, ["--import-memory"])).includes(6)) {
      throw new Error(
        "an allocating unit has no global section to carry its heap window",
      );
    }
  },
});

Deno.test({
  name: "import-memory: `vl run` refuses the link flags with exit 2",
  ignore: !ENABLED,
  fn: async () => {
    for (const flag of ["--import-memory", "--heap-base=0x1000"]) {
      const r = await vl(["run", flag, "-e", "print(1)"]);
      eq(r.code, 2, `vl run ${flag} exit code`);
      if (!r.err.includes(flag.split("=")[0])) {
        throw new Error(
          `vl run ${flag}: the refusal does not name the flag:\n${r.err}`,
        );
      }
    }
  },
});

// ── 2. the heap window ───────────────────────────────────────────────────────

Deno.test({
  name: "heap window: the default base is still 1024",
  ignore: !ENABLED,
  fn: async () => {
    const ex = await instantiate(
      await build(WRITER, ["--import-memory"]),
      new WebAssembly.Memory({ initial: 1 }),
    );
    eq(ex.put(1), 1024, "first Buf's base");
    eq(ex.put(2), 1040, "second Buf's base");
  },
});

Deno.test({
  name:
    "heap window: Bufs start at --heap-base and an allocation past --heap-limit traps without growing the memory",
  ignore: !ENABLED,
  fn: async () => {
    const bytes = await build(WRITER, [
      "--import-memory",
      "--heap-base=0x20000",
      "--heap-limit=0x20030",
    ]);
    const memory = new WebAssembly.Memory({ initial: 4 });
    const ex = await instantiate(bytes, memory);
    eq(
      [ex.put(1), ex.put(2), ex.put(3)],
      [0x20000, 0x20010, 0x20020],
      "three Bufs fill the window",
    );
    let trapped = false;
    try {
      ex.put(4);
    } catch (e) {
      trapped = e instanceof WebAssembly.RuntimeError;
    }
    if (!trapped) {
      throw new Error("a fourth Buf past --heap-limit did not trap");
    }
    eq(memory.buffer.byteLength, 4 * 65536, "the memory did not grow");
  },
});

Deno.test({
  name: "heap window: malformed or inconsistent windows are usage errors",
  ignore: !ENABLED,
  fn: async () => {
    const tmp = await Deno.makeTempDir();
    try {
      await Deno.writeTextFile(`${tmp}/t.vl`, WRITER);
      for (
        const bad of [
          ["--heap-base=0"],
          ["--heap-base=12"],
          ["--heap-base=0x2000", "--heap-limit=0x1000"],
          ["--heap-base=0x1000", "--heap-limit=0x1004"],
          ["--heap-base=lots"],
          ["--heap-limt=0x100"],
          ["--heap-base", "0x10000"],
          ["--import-memory=foo"],
          ["--import-memory", "--import-memory"],
          ["--heap-base=0x1000", "--heap-base=0x2000"],
        ]
      ) {
        const r = await vl([
          "build",
          `${tmp}/t.vl`,
          "-o",
          `${tmp}/t.wasm`,
          "--compiler",
          COMPILER,
          ...bad,
        ]);
        eq(r.code, 2, `vl build ${bad.join(" ")} exit code`);
      }
    } finally {
      await Deno.remove(tmp, { recursive: true });
    }
  },
});

Deno.test({
  name:
    "heap window: an allocating unit under --import-memory with no --heap-base is warned about",
  ignore: !ENABLED,
  fn: async () => {
    const tmp = await Deno.makeTempDir();
    try {
      const warned = async (src: string, flags: string[]) => {
        await Deno.writeTextFile(`${tmp}/t.vl`, src);
        const r = await vl([
          "build",
          `${tmp}/t.vl`,
          "-o",
          `${tmp}/t.wasm`,
          "--compiler",
          COMPILER,
          ...flags,
        ]);
        eq(r.code, 0, `vl build ${flags.join(" ")} exit code`);
        return r.err.includes("warning");
      };
      eq(
        await warned(WRITER, ["--import-memory"]),
        true,
        "allocating, no window",
      );
      eq(
        await warned(WRITER, ["--import-memory", "--heap-base=0x10000"]),
        false,
        "allocating, with a window",
      );
      eq(await warned(CODE_ONLY, ["--import-memory"]), false, "code-only unit");
      eq(await warned(WRITER, []), false, "no --import-memory");
    } finally {
      await Deno.remove(tmp, { recursive: true });
    }
  },
});

Deno.test({
  name: "heap window: bufferRelease traps on an unaligned mark",
  ignore: !ENABLED,
  fn: async () => {
    const ex = await instantiate(
      await build(
        `import { Buffer, bufferRelease } from "std:buffer"
export function go(off: i32): i32 {
  const b = Buffer(16)
  bufferRelease(b.base + off)
  b.base
}
`,
        ["--import-memory", "--heap-base=0x10000", "--heap-limit=0x10100"],
      ),
      new WebAssembly.Memory({ initial: 2 }),
    );
    eq(ex.go(8), 0x10000, "an aligned mark is accepted");
    let trapped = false;
    try {
      ex.go(4);
    } catch (e) {
      trapped = e instanceof WebAssembly.RuntimeError;
    }
    if (!trapped) {
      throw new Error(
        "an unaligned mark was accepted — the next Buf could pass the limit",
      );
    }
  },
});

// ── 3. two units, one memory ─────────────────────────────────────────────────

/** The provider module the recipe links first, under the name `env`:
 * `(module (import "host" "memory" (memory 1)) (export "memory" (memory 0)))`. wasm-merge
 * binds each unit's `env.memory` import to THIS export, so the units share its one memory. */
const PROVIDER = new Uint8Array([
  0x00,
  0x61,
  0x73,
  0x6d,
  0x01,
  0x00,
  0x00,
  0x00, // magic, version
  0x02,
  0x10,
  0x01,
  0x04,
  0x68,
  0x6f,
  0x73,
  0x74, // import section: 1, "host"
  0x06,
  0x6d,
  0x65,
  0x6d,
  0x6f,
  0x72,
  0x79,
  0x02, //   "memory", kind memory
  0x00,
  0x01, //   limits: min 1
  0x07,
  0x0a,
  0x01,
  0x06,
  0x6d,
  0x65,
  0x6d,
  0x6f, // export section: 1, "memory"
  0x72,
  0x79,
  0x02,
  0x00, //   kind memory, index 0
]);

/** Features a VL module needs, and NOT multi-memory: the recipe must not depend on it. */
const MERGE_FEATURES = [
  "--enable-gc",
  "--enable-reference-types",
  "--enable-bulk-memory",
  "--enable-tail-call",
];

/** Link `units` with wasm-merge through the provider recipe, then check the result has
 * exactly ONE memory: imported as `host.memory`, with no memory section beside it, so no
 * instruction can name a memory index other than 0. */
const merge = async (units: Uint8Array[]): Promise<Uint8Array> => {
  const tmp = await Deno.makeTempDir();
  try {
    await Deno.writeFile(`${tmp}/env.wasm`, PROVIDER);
    const args: string[] = [`${tmp}/env.wasm`, "env"];
    for (let i = 0; i < units.length; i++) {
      await Deno.writeFile(`${tmp}/u${i}.wasm`, units[i]);
      args.push(`${tmp}/u${i}.wasm`, `unit${i}`);
    }
    const { code, stderr } = await new Deno.Command(WASM_MERGE, {
      args: [...args, ...MERGE_FEATURES, "-o", `${tmp}/merged.wasm`],
      stdout: "piped",
      stderr: "piped",
    }).output();
    if (code !== 0) {
      throw new Error(`wasm-merge failed: ${dec.decode(stderr).trim()}`);
    }
    const merged = await Deno.readFile(`${tmp}/merged.wasm`);
    eq(
      memoryShape(merged).imports,
      ["host.memory"],
      "the linked module's memory imports",
    );
    if (sectionIds(merged).includes(5)) {
      throw new Error(
        "the linked module defines a memory beside the imported one",
      );
    }
    return merged;
  } finally {
    await Deno.remove(tmp, { recursive: true });
  }
};

Deno.test({
  name:
    "import-memory: two merged units share one memory — and collide without windows",
  ignore: !ENABLED || !HAVE_MERGE,
  fn: async () => {
    const merged = await merge([
      await build(WRITER, ["--import-memory"]),
      await build(READER, ["--import-memory"]),
    ]);
    const ex = await instantiate(
      merged,
      new WebAssembly.Memory({ initial: 1 }),
    );
    const a = ex.put(0x1111);
    eq(ex.peek(a), 0x1111, "unit 1 reads the Buf unit 0 wrote");
    // The hazard: both allocators start at the default base, so unit 1's first Buf
    // is unit 0's first Buf.
    const b = ex.own(0x2222);
    eq(b, a, "without windows both units hand out the same address");
    eq(ex.peek(a), 0x2222, "unit 0's Buf was overwritten");
  },
});

Deno.test({
  name:
    "import-memory: disjoint windows keep two merged units' Bufs apart beside a code-only unit",
  ignore: !ENABLED || !HAVE_MERGE,
  fn: async () => {
    const merged = await merge([
      await build(WRITER, [
        "--import-memory",
        "--heap-base=0x10000",
        "--heap-limit=0x18000",
      ]),
      await build(READER, [
        "--import-memory",
        "--heap-base=0x18000",
        "--heap-limit=0x20000",
      ]),
      await build(CODE_ONLY, ["--import-memory"]),
    ]);
    const memory = new WebAssembly.Memory({ initial: 3 });
    const ex = await instantiate(merged, memory);
    const a = ex.put(0x1111);
    const b = ex.own(0x2222);
    eq([a, b], [0x10000, 0x18000], "each unit allocates inside its own window");
    eq(
      [ex.peek(a), ex.peek(b)],
      [0x1111, 0x2222],
      "neither Buf was overwritten",
    );
    // The code-only unit works on guest memory OUTSIDE both windows.
    const dv = new DataView(memory.buffer);
    dv.setInt32(0x20000, 40, true);
    dv.setInt32(0x20004, 2, true);
    ex.add32(0x20000, 0x20004, 0x20008);
    eq(dv.getInt32(0x20008, true), 42, "the code-only unit's store");
    eq(
      [ex.peek(a), ex.peek(b)],
      [0x1111, 0x2222],
      "the windows are untouched by it",
    );
    // Below the lower window, VL wrote nothing at all.
    const stray = new Uint8Array(memory.buffer, 0, 0x10000).findIndex((x) =>
      x !== 0
    );
    eq(stray, -1, "first nonzero byte below the windows");
  },
});
