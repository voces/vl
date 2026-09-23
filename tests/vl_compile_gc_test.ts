// THE COMPILER'S COLLECTOR FOLLOWS THE SOURCE'S SIZE (DECISIONS.md, "The compiler's
// collector is picked by the size of the source").
//
// `vl build` and `vl run` compile under the null collector below 1.5 MiB of entry source
// and under the copying collector at or above it; `$VL_COMPILE_GC` overrides the choice.
// The null collector never frees, so a large source under it costs every byte the
// compiler ever allocated (~3 GB at 11 MB) and traps near 15.6 MB. What this suite pins:
//
//   * the switch sits exactly at the threshold, measured in UTF-8 bytes;
//   * the override wins both ways, and an unknown value is refused, not ignored;
//   * the two collectors emit the SAME module bytes (a collector is not semantics).
//
// `$VL_COMPILE_GC_TRACE=1` makes the host name its choice on stderr. The sources are a
// comment pad, so each build is ~1.5 MB of lexing and nothing else.
//
// GATING: env-gated (`SELFHOST_NATIVE_ALIGN=1`) + needs the built binary + seed.
//
// @test-timing native

import { COMPILER, VL, exists, nativeEnv } from "./support/tree.ts";

const GATED = Deno.env.get("SELFHOST_NATIVE_ALIGN") === "1";
const ENABLED = GATED && exists(VL) && exists(COMPILER);
if (GATED && !ENABLED) {
  console.warn("[vl-compile-gc] skipped — missing vl binary or seed wasm.");
}

// Mirrors `COPYING_COMPILE_THRESHOLD` in scripts/vl-host/src/main.rs, on purpose: a
// test reading the constant would move with it.
const THRESHOLD = 1_572_864;

type Res = { code: number; out: string; err: string };

const vl = async (args: string[], gc?: string): Promise<Res> => {
  const extra: Record<string, string> = { NO_COLOR: "1", VL_COMPILE_GC_TRACE: "1" };
  // Always set, so a VL_COMPILE_GC in the caller's environment cannot leak in.
  extra.VL_COMPILE_GC = gc ?? "auto";
  const { code, stdout, stderr } = await new Deno.Command(VL, {
    args: [...args, "--compiler", COMPILER],
    stdout: "piped",
    stderr: "piped",
    env: nativeEnv(extra),
  }).output();
  return {
    code,
    out: new TextDecoder().decode(stdout),
    err: new TextDecoder().decode(stderr),
  };
};

const show = (r: Res): string =>
  `rc ${r.code}\nstdout: ${r.out.slice(0, 400)}\nstderr: ${r.err.slice(0, 1000)}`;

/** A program of exactly `bytes` UTF-8 bytes: `print(7)` after a comment pad. */
const sourceOf = (bytes: number): string => {
  const tail = "print(7)\n";
  const line = "// " + "x".repeat(96) + "\n"; // 100 bytes
  let pad = line.repeat(Math.floor((bytes - tail.length) / line.length));
  const rest = bytes - tail.length - pad.length;
  if (rest > 0) pad += "/".repeat(Math.max(rest - 1, 0)) + (rest > 1 ? "\n" : " ");
  const src = pad + tail;
  if (new TextEncoder().encode(src).length !== bytes) {
    throw new Error(`fixture drifted: wanted ${bytes} bytes`);
  }
  return src;
};

const withDir = async (fn: (dir: string) => Promise<void>): Promise<void> => {
  const dir = await Deno.makeTempDir({ prefix: "vl_compile_gc_" });
  try {
    await fn(dir);
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
};

/** Build `bytes` of source under `gc`; assert the named collector; return the module. */
const buildWith = async (
  dir: string,
  bytes: number,
  gc: string | undefined,
  want: "null" | "copying",
): Promise<Uint8Array> => {
  const prog = `${dir}/p${bytes}.vl`;
  const out = `${dir}/p${bytes}-${gc ?? "auto"}.wasm`;
  await Deno.writeTextFile(prog, sourceOf(bytes));
  const r = await vl(["build", prog, "-o", out], gc);
  const line = `vl: compile collector: ${want} (entry source ${bytes} bytes)`;
  if (r.code !== 0 || !r.err.includes(line)) {
    throw new Error(`build ${bytes} B, VL_COMPILE_GC=${gc ?? "auto"}: want rc 0 and "${line}", got ${show(r)}`);
  }
  return await Deno.readFile(out);
};

const same = (a: Uint8Array, b: Uint8Array): boolean =>
  a.length === b.length && a.every((x, i) => x === b[i]);

Deno.test({
  name: "vl-compile-gc: auto picks null one byte below the threshold and copying at it",
  ignore: !ENABLED,
  fn: async () => {
    await withDir(async (dir) => {
      const below = await buildWith(dir, THRESHOLD - 1, undefined, "null");
      const at = await buildWith(dir, THRESHOLD, undefined, "copying");
      if (!same(below, at)) {
        throw new Error("the two pads differ only in a comment: want identical modules");
      }
    });
  },
});

Deno.test({
  name: "vl-compile-gc: VL_COMPILE_GC overrides auto both ways, with identical output",
  ignore: !ENABLED,
  fn: async () => {
    await withDir(async (dir) => {
      const copying = await buildWith(dir, THRESHOLD, undefined, "copying");
      const pinned = await buildWith(dir, THRESHOLD, "null", "null");
      const small = await buildWith(dir, 64, "copying", "copying");
      if (!same(copying, pinned) || !same(copying, small)) {
        throw new Error("a collector changed the emitted module: want identical bytes");
      }
    });
  },
});

Deno.test({
  name: "vl-compile-gc: an unknown VL_COMPILE_GC is refused, not ignored",
  ignore: !ENABLED,
  fn: async () => {
    await withDir(async (dir) => {
      const prog = `${dir}/p.vl`;
      await Deno.writeTextFile(prog, "print(7)\n");
      const r = await vl(["build", prog, "-o", `${dir}/p.wasm`], "tracing");
      if (r.code === 0 || !r.err.includes("unknown $VL_COMPILE_GC `tracing`")) {
        throw new Error(`want a refusal naming the value, got ${show(r)}`);
      }
    });
  },
});
