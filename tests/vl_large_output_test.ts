// A MODULE LARGER THAN 8 MiB BUILDS, AND A LITERAL THAT USED TO MAKE A BODY PAST THE ENGINE'S
// LIMIT RUNS (D1976 — the output-side twin of D1975 — and D2092).
//
// The compile store runs under the null collector, whose largest single allocation is
// 64 MiB. The emitter used to hold its output as `i32[]`, one slot per byte, so `.push`'s
// growth to 2^24 slots trapped with `allocation size too large` as soon as the module — or
// one function body — passed 2^23 bytes. Bytes are now packed `u8[]`, each code entry is a
// buffer of its own, and the module is a rope of those buffers that the host reads out
// chunk by chunk (`rbyteStore`). A literal past the pool's cap is a passive data segment.
//
//   * THE MODULE: two functions each returning a distinct 4.5M-character literal — a 9 MB
//     module, nearly all of it the data section. It must build, and then RUN under V8, which
//     is what proves the rope was read out whole and in order: a chunk lost, doubled or
//     reordered breaks the framing or the printed length.
//   * ONE BODY: D1976's witness, a single 2.85M-character literal, made an 8.55 MB body that
//     trapped in its own buffer and then met wasmtime's 7,654,321-byte limit. It is a data
//     segment now: the body is a few instructions and the module runs.
//
// The big functions live in an IMPORTED module so the entry stays small, and with it the
// host's choice of collector: the trap was the null collector's. The modules run under V8.
//
// GATING: env-gated (`SELFHOST_NATIVE_ALIGN=1`) + needs the built binary + seed.
//
// @test-timing native

import { COMPILER, VL, exists, nativeEnv } from "./support/tree.ts";
import { runWasm } from "./support/runWasm.ts";

const GATED = Deno.env.get("SELFHOST_NATIVE_ALIGN") === "1";
const ENABLED = GATED && exists(VL) && exists(COMPILER);
if (GATED && !ENABLED) {
  console.warn("[vl-large-output] skipped — missing vl binary or seed wasm.");
}

// The old ceiling: an `i32[]` of 2^23 slots is 32 MiB, and its next growth is 64 MiB.
const OLD_CEILING = 1 << 23;
// wasmtime's per-body limit, as its validator words it.
const BODY_LIMIT_MSG = "function body size count exceeds limit of 7654321";

type Res = { code: number; out: string; err: string };

const vl = async (args: string[]): Promise<Res> => {
  const { code, stdout, stderr } = await new Deno.Command(VL, {
    args: [...args, "--compiler", COMPILER],
    stdout: "piped",
    stderr: "piped",
    env: nativeEnv({ NO_COLOR: "1" }),
  }).output();
  return {
    code,
    out: new TextDecoder().decode(stdout),
    err: new TextDecoder().decode(stderr),
  };
};

const withDir = async (fn: (dir: string) => Promise<void>): Promise<void> => {
  const dir = await Deno.makeTempDir({ prefix: "vl_large_output_" });
  try {
    await fn(dir);
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
};

const show = (r: Res): string =>
  `rc ${r.code}\nstdout: ${r.out.slice(0, 400)}\nstderr: ${r.err.slice(0, 2000)}`;

Deno.test({
  name: "vl-large-output: a 9 MB module builds and runs whole under V8 (D1976's repro)",
  ignore: !ENABLED,
  fn: async () => {
    await withDir(async (dir) => {
      const prog = `${dir}/main.vl`;
      const n = 4_500_000;
      await Deno.writeTextFile(
        `${dir}/m.vl`,
        `export function f0(): string { "${"a".repeat(n)}" }\n` +
          `export function f1(): string { "${"b".repeat(n)}" }\n`,
      );
      await Deno.writeTextFile(prog, `import { f0, f1 } from "./m"\nprint(f0().length + f1().length)\n`);
      const out = `${dir}/big.wasm`;
      const r = await vl(["build", prog, "-o", out]);
      if (r.code !== 0) throw new Error(`vl build main.vl: want rc 0, got ${show(r)}`);
      const bytes = await Deno.readFile(out);
      if (bytes.length <= OLD_CEILING) {
        throw new Error(`fixture drifted: want a module past ${OLD_CEILING} bytes, got ${bytes.length}`);
      }
      const { logs } = await runWasm(bytes);
      if (logs.join("\n") !== String(2 * n)) {
        throw new Error(`running big.wasm under V8: want ${2 * n}, got ${JSON.stringify(logs)}`);
      }
    });
  },
});

Deno.test({
  name: "vl-large-output: a literal that made a body past the engine's limit is a data segment and runs",
  ignore: !ENABLED,
  fn: async () => {
    await withDir(async (dir) => {
      const prog = `${dir}/main.vl`;
      const n = 2_850_000;
      await Deno.writeTextFile(`${dir}/m.vl`, `export function f0(): string { "${"a".repeat(n)}" }\n`);
      await Deno.writeTextFile(prog, `import { f0 } from "./m"\nprint(f0().length)\n`);
      const out = `${dir}/body.wasm`;
      const r = await vl(["build", prog, "-o", out]);
      const text = r.out + r.err;
      if (r.code !== 0 || text.includes(BODY_LIMIT_MSG) || text.includes("allocation size too large")) {
        throw new Error(`vl build main.vl: want rc 0 with no body limit and no trap, got ${show(r)}`);
      }
      const { logs } = await runWasm(await Deno.readFile(out));
      if (logs.join("\n") !== String(n)) {
        throw new Error(`running body.wasm under V8: want ${n}, got ${JSON.stringify(logs)}`);
      }
    });
  },
});
