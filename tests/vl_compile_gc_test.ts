// THE COMPILER'S COLLECTOR FOLLOWS THE ENTRY FILE'S SIZE (DECISIONS.md, "The compiler's
// collector is picked by the size of the entry file").
//
// `vl build` and `vl run` compile under the null collector when the ENTRY FILE is under
// 1.5 MiB (imports do not count) and under the copying collector at or above it;
// `$VL_COMPILE_GC` overrides the choice.
// The null collector never frees, so a large source under it costs every byte the
// compiler ever allocated (~3 GB at 11 MB) and traps near 15.6 MB. What this suite pins:
//
//   * the switch sits exactly at the threshold, measured in UTF-8 bytes;
//   * the override wins both ways, and an unknown value is refused, not ignored;
//   * the two collectors emit the SAME module bytes (a collector is not semantics), on a
//     real program with structs, closures, unions and strings as well as a pad;
//   * a null-collector compile that traps on `allocation size too large` names the escape.
//     There is no automatic retry under copying; DECISIONS.md says why.
//
// `$VL_COMPILE_GC_TRACE=1` makes the host name its choice on stderr. The sources are a
// comment pad, so each build is ~1.5 MB of lexing and nothing else.
//
// GATING: env-gated (`SELFHOST_NATIVE_ALIGN=1`) + needs the built binary + seed.
//
// @test-timing native

import { COMPILER, exists, nativeEnv, ROOT, VL } from "./support/tree.ts";

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
  const extra: Record<string, string> = {
    NO_COLOR: "1",
    VL_COMPILE_GC_TRACE: "1",
  };
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
  `rc ${r.code}\nstdout: ${r.out.slice(0, 400)}\nstderr: ${
    r.err.slice(0, 1000)
  }`;

/** A program of exactly `bytes` UTF-8 bytes: `print(7)` after a comment pad. */
const sourceOf = (bytes: number): string => {
  const tail = "print(7)\n";
  const line = "// " + "x".repeat(96) + "\n"; // 100 bytes
  let pad = line.repeat(Math.floor((bytes - tail.length) / line.length));
  const rest = bytes - tail.length - pad.length;
  if (rest > 0) {
    pad += "/".repeat(Math.max(rest - 1, 0)) + (rest > 1 ? "\n" : " ");
  }
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
  const line = `vl: compile collector: ${want} (entry file ${bytes} bytes)`;
  if (r.code !== 0 || !r.err.includes(line)) {
    throw new Error(
      `build ${bytes} B, VL_COMPILE_GC=${
        gc ?? "auto"
      }: want rc 0 and "${line}", got ${show(r)}`,
    );
  }
  return await Deno.readFile(out);
};

const same = (a: Uint8Array, b: Uint8Array): boolean =>
  a.length === b.length && a.every((x, i) => x === b[i]);

Deno.test({
  name:
    "vl-compile-gc: auto picks null one byte below the threshold and copying at it",
  ignore: !ENABLED,
  fn: async () => {
    await withDir(async (dir) => {
      const below = await buildWith(dir, THRESHOLD - 1, undefined, "null");
      const at = await buildWith(dir, THRESHOLD, undefined, "copying");
      if (!same(below, at)) {
        throw new Error(
          "the two pads differ only in a comment: want identical modules",
        );
      }
    });
  },
});

Deno.test({
  name:
    "vl-compile-gc: VL_COMPILE_GC overrides auto both ways, with identical output",
  ignore: !ENABLED,
  fn: async () => {
    await withDir(async (dir) => {
      const copying = await buildWith(dir, THRESHOLD, undefined, "copying");
      const pinned = await buildWith(dir, THRESHOLD, "null", "null");
      const small = await buildWith(dir, 64, "copying", "copying");
      if (!same(copying, pinned) || !same(copying, small)) {
        throw new Error(
          "a collector changed the emitted module: want identical bytes",
        );
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

// A real program: two function-typed union arms, five nominal types, closures, strings.
const REAL =
  `${ROOT}/tests/cases/closures/is-two-function-arms-both-directions.vl`;

Deno.test({
  name:
    "vl-compile-gc: null and copying emit identical bytes for a real program",
  ignore: !ENABLED,
  fn: async () => {
    await withDir(async (dir) => {
      const outs: Uint8Array[] = [];
      for (const gc of ["null", "copying"]) {
        const out = `${dir}/real-${gc}.wasm`;
        const r = await vl(["build", REAL, "-o", out], gc);
        if (r.code !== 0 || !r.err.includes(`vl: compile collector: ${gc} `)) {
          throw new Error(
            `build under ${gc}: want rc 0 naming the collector, got ${show(r)}`,
          );
        }
        outs.push(await Deno.readFile(out));
      }
      if (outs[0].length < 1000 || !same(outs[0], outs[1])) {
        throw new Error(
          `want identical non-trivial modules, got ${outs[0].length} / ${
            outs[1].length
          } bytes`,
        );
      }
    });
  },
});

Deno.test({
  name:
    "vl-compile-gc: a null-collector compiler trap on allocation size names VL_COMPILE_GC=copying",
  ignore: !ENABLED,
  fn: async () => {
    await withDir(async (dir) => {
      // D1977's witness: a small entry file, so the null collector, and one literal past 2^23
      // code points, whose string-pool decode outgrows the 64 MiB object cap. About 0.3 s.
      await Deno.writeTextFile(
        `${dir}/m.vl`,
        `export function f0(): string { "${"a".repeat(8_400_000)}" }\n`,
      );
      await Deno.writeTextFile(
        `${dir}/main.vl`,
        `import { f0 } from "./m"\nprint(f0().length)\n`,
      );
      const r = await vl(["build", `${dir}/main.vl`, "-o", `${dir}/main.wasm`]);
      if (
        r.code !== 70 || !r.err.includes("vl: compile collector: null ") ||
        !r.err.includes(
          "`VL_COMPILE_GC=copying` compiles under a collecting one",
        )
      ) {
        throw new Error(
          `want exit 70 under null with the escape named, got ${show(r)}`,
        );
      }
    });
  },
});
