// `vl build --initial-memory=<size>` / `--max-memory=<size>` — the linear memory's declared size.
//
// Growing a wasm memory detaches every JS typed-array view of its old buffer, so a host that
// keeps views across calls breaks the first time a `Buffer()` grows the memory (sunpa SP-011).
// Starting the memory large enough means `std:buffer` never grows it. Sizes are bytes or
// KiB/MiB/GiB, a whole number of 64 KiB pages; `--max-memory` and `--shared-memory` both declare
// the max and are refused together (D3560; DECISIONS.md §"A memory's size is a build flag").
//
// Gated like the other native suites (binary + seed). The `vl_` prefix puts it in ci-native.
//
// @test-timing native

import { COMPILER, exists, nativeEnv, ROOT, VL } from "./support/tree.ts";
import { memoryLimits } from "./support/wasmMemory.ts";

const ENABLED = exists(VL) && exists(COMPILER);
const WASM_OPT = `${ROOT}/node_modules/.bin/wasm-opt`;
const WASM_DIS = `${ROOT}/node_modules/.bin/wasm-dis`;
const HAVE_OPT = exists(WASM_OPT);
if (!ENABLED) {
  console.warn("[initial-memory] skipped — missing vl binary or seed wasm");
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

/** Run `vl <cmd> <src as a file> --compiler <seed> ...flags`; `wasm` is the built module, if any. */
const withSrc = async (cmd: "build" | "run", src: string, flags: string[]) => {
  const tmp = await Deno.makeTempDir();
  try {
    await Deno.writeTextFile(`${tmp}/t.vl`, src);
    const out = cmd === "build" ? ["-o", `${tmp}/t.wasm`] : [];
    const r = await vl([cmd, `${tmp}/t.vl`, ...out, "--compiler", COMPILER, ...flags]);
    const wasm = cmd === "build" && r.code === 0 ? await Deno.readFile(`${tmp}/t.wasm`) : null;
    let wat = "";
    if (wasm && exists(WASM_DIS)) {
      const d = await new Deno.Command(WASM_DIS, {
        args: [`${tmp}/t.wasm`, "--enable-threads", "--enable-gc", "--enable-reference-types"],
        stdout: "piped",
      }).output();
      wat = dec.decode(d.stdout);
    }
    return { ...r, wasm, wat };
  } finally {
    await Deno.remove(tmp, { recursive: true });
  }
};

const build = async (src: string, flags: string[] = []) => {
  const r = await withSrc("build", src, flags);
  if (r.code !== 0 || !r.wasm) throw new Error(`vl build ${flags.join(" ")}: ${r.err.trim()}`);
  return r;
};

const eq = (got: unknown, want: unknown, what: string) => {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g !== w) throw new Error(`${what}\n  want ${w}\n  got  ${g}`);
};

// A frame's shape: the host holds a view of memory across a call that allocates.
const ALLOC = `import { Buffer, storeI32 } from "std:buffer"
export function alloc(n: i32): i32 {
  const b = Buffer(n)
  storeI32(b, n - 4, 7)
  b.base + n - 4
}
export function pages(): i32 { __memory_size__() }
`;

Deno.test({
  name: "initial-memory: the declaration carries the initial and max pages, defined or imported",
  ignore: !ENABLED,
  async fn() {
    const rows: [string[], unknown][] = [
      [[], { where: "defined", flag: 0, min: 1, max: null }],
      [["--initial-memory=8MiB"], { where: "defined", flag: 0, min: 128, max: null }],
      [["--initial-memory=8388608"], { where: "defined", flag: 0, min: 128, max: null }],
      [["--initial-memory=1MiB", "--max-memory=2MiB"], {
        where: "defined",
        flag: 1,
        min: 16,
        max: 32,
      }],
      [["--max-memory=256KiB"], { where: "defined", flag: 1, min: 1, max: 4 }],
      [["--import-memory", "--heap-base=0x10000", "--initial-memory=8MiB"], {
        where: "imported",
        flag: 0,
        min: 128,
        max: null,
      }],
      [["--shared-memory=256", "--initial-memory=8MiB"], {
        where: "defined",
        flag: 3,
        min: 128,
        max: 256,
      }],
    ];
    for (const [flags, want] of rows) {
      eq(memoryLimits((await build(ALLOC, flags)).wasm!), want, flags.join(" ") || "default");
    }
    // The disassembler reads the same declaration.
    const { wat } = await build(ALLOC, ["--initial-memory=8MiB", "--max-memory=16MiB"]);
    if (exists(WASM_DIS) && !/\(memory \$0 128 256\)/.test(wat)) {
      throw new Error(`wasm-dis does not show (memory $0 128 256):\n${wat.slice(0, 600)}`);
    }
  },
});

Deno.test({
  name: "initial-memory: one page spelled out is byte-identical to the default build",
  ignore: !ENABLED,
  async fn() {
    const a = (await build(ALLOC)).wasm!, b = (await build(ALLOC, ["--initial-memory=64KiB"])).wasm!;
    eq(a.length === b.length && a.every((x, i) => x === b[i]), true, "64KiB vs default bytes");
  },
});

Deno.test({
  name: "initial-memory: -O keeps the declared sizes",
  ignore: !ENABLED || !HAVE_OPT,
  async fn() {
    const { wasm } = await build(ALLOC, ["-O", "--initial-memory=8MiB", "--max-memory=16MiB"]);
    eq(memoryLimits(wasm!), { where: "defined", flag: 1, min: 128, max: 256 }, "-O limits");
  },
});

// The SP-011 frame: a view taken before an allocating call stays attached when the memory
// starts large enough, and detaches (byteLength 0) when the allocation grows it.
Deno.test({
  name: "initial-memory: an allocation under the initial size never grows memory or detaches a view",
  ignore: !ENABLED,
  async fn() {
    const frame = async (flags: string[]) => {
      const { wasm } = await build(ALLOC, flags);
      // The trap/print imports a std:buffer unit names; nothing here calls them.
      const imports = new Proxy({}, { get: () => () => {} });
      const { instance } = await WebAssembly.instantiate(wasm! as BufferSource, { imports });
      const ex = instance.exports as {
        alloc: (n: number) => number;
        pages: () => number;
        memory: WebAssembly.Memory;
      };
      const view = new Int32Array(ex.memory.buffer);
      const before = ex.pages();
      const at = ex.alloc(4 << 20);
      return {
        before,
        after: ex.pages(),
        attached: view.byteLength > 0,
        read: new Int32Array(ex.memory.buffer)[at >> 2],
      };
    };
    eq(
      await frame(["--initial-memory=8MiB"]),
      { before: 128, after: 128, attached: true, read: 7 },
      "8 MiB initial",
    );
    // The control: the default one-page memory grows, and the view taken before is detached.
    eq(await frame([]), { before: 1, after: 65, attached: false, read: 7 }, "default memory");
  },
});

Deno.test({
  name: "initial-memory: vl run takes the flags and the memory never grows under budget",
  ignore: !ENABLED,
  async fn() {
    const src = `import { Buffer, storeI32, loadI32 } from "std:buffer"
const before = __memory_size__()
const b = Buffer(4 * 1024 * 1024)
storeI32(b, 4 * 1024 * 1024 - 4, 42)
print(loadI32(b, 4 * 1024 * 1024 - 4))
print(before)
print(__memory_size__())
`;
    const r = await withSrc("run", src, ["--initial-memory=8MiB"]);
    eq(r.code, 0, `vl run: ${r.err}`);
    eq(r.out.trim().split("\n"), ["42", "128", "128"], "vl run output");
    // A max below what the program allocates is a trap at the growth, not a silent overrun.
    const capped = await withSrc("run", src, ["--max-memory=2MiB"]);
    eq(capped.code, 1, `capped run should trap: ${capped.out}`);
  },
});

Deno.test({
  name: "initial-memory: invalid sizes and combinations are refused with exit 2",
  ignore: !ENABLED,
  async fn() {
    const rows: [string[], string][] = [
      [["--initial-memory=100"], "a memory is a whole number of 64 KiB pages"],
      [["--initial-memory=0"], "a memory is a whole number of 64 KiB pages"],
      [["--initial-memory=5GiB"], "past 4 GiB"],
      [["--max-memory=4294967297"], "past 4 GiB"],
      [["--initial-memory=8mb"], "expected a size in bytes, or with a KiB, MiB or GiB suffix"],
      [["--initial-memory"], "takes its size after `=`"],
      [["--initial-memory=2MiB", "--max-memory=1MiB"], "cannot start larger than its maximum"],
      [["--shared-memory=16", "--initial-memory=2MiB"], "cannot start larger than its maximum"],
      [["--shared-memory=16", "--max-memory=1MiB"], "both declare the memory's maximum"],
      [["--initial-memory=1MiB", "--initial-memory=2MiB"], "given twice"],
      [["--initial-mem=1MiB"], "unknown layout flag"],
    ];
    for (const [flags, want] of rows) {
      for (const cmd of ["build", "run"] as const) {
        if (cmd === "run" && flags[0] === "--initial-mem=1MiB") continue; // run: unknown flag
        const r = await withSrc(cmd, ALLOC, flags);
        eq(r.code, 2, `${cmd} ${flags.join(" ")} exit (${r.err.trim()})`);
        if (!r.err.includes(want)) {
          throw new Error(`${cmd} ${flags.join(" ")}: want "${want}" in\n${r.err}`);
        }
      }
    }
  },
});
