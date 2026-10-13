// THE COMPILER COMPILES UNDER THE COPYING COLLECTOR BY DEFAULT (DECISIONS.md, "The
// compiler's collector is copying by default").
//
// `vl build` and `vl run` compile under the copying collector at every entry-file size;
// `$VL_COMPILE_GC=null` picks the null collector, which never frees: about as fast, but a
// build holds every byte it allocated (2.4 GB for sunpa's `game.vl`, against ~0.56 GB).
// What this suite pins:
//
//   * an unset variable and `auto` are copying, for a tiny entry file and a large one;
//   * the override wins both ways, and an unknown value is refused, not ignored;
//   * the two collectors emit the SAME module bytes (a collector is not semantics), on a
//     real program with structs, closures, unions and strings as well as a pad;
//   * a null-collector compile that traps on `allocation size too large` names the escape.
//     There is no automatic retry under copying; DECISIONS.md says why.
//
// `$VL_COMPILE_GC_TRACE=1` makes the host name its choice on stderr. The sources are a
// comment pad, so each build is lexing and nothing else.
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

// Past the 1.5 MiB entry-file threshold that picked the collector until 2026-10-07.
const LARGE = 2_000_000;

type Res = { code: number; out: string; err: string };

/** `gc` undefined is `auto`; `null` leaves `VL_COMPILE_GC` unset. */
const vl = async (args: string[], gc?: string | null): Promise<Res> => {
  const env: Record<string, string> = {
    ...Deno.env.toObject(),
    ...nativeEnv({ NO_COLOR: "1", VL_COMPILE_GC_TRACE: "1" }),
  };
  // Set unless asked not to, so a VL_COMPILE_GC in the caller's environment cannot leak in.
  if (gc === null) delete env.VL_COMPILE_GC;
  else env.VL_COMPILE_GC = gc ?? "auto";
  const { code, stdout, stderr } = await new Deno.Command(VL, {
    args: [...args, "--compiler", COMPILER],
    stdout: "piped",
    stderr: "piped",
    env,
    clearEnv: true,
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
  gc: string | null | undefined,
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
        gc === null ? "(unset)" : gc ?? "auto"
      }: want rc 0 and "${line}", got ${show(r)}`,
    );
  }
  return await Deno.readFile(out);
};

const same = (a: Uint8Array, b: Uint8Array): boolean =>
  a.length === b.length && a.every((x, i) => x === b[i]);

Deno.test({
  name:
    "vl-compile-gc: an unset VL_COMPILE_GC and auto pick copying, for a tiny entry file and a large one",
  ignore: !ENABLED,
  fn: async () => {
    await withDir(async (dir) => {
      const unset = await buildWith(dir, 64, null, "copying");
      const tiny = await buildWith(dir, 64, undefined, "copying");
      const large = await buildWith(dir, LARGE, undefined, "copying");
      if (!same(unset, tiny) || !same(tiny, large)) {
        throw new Error(
          "the pads differ only in a comment: want identical modules",
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
      const copying = await buildWith(dir, LARGE, undefined, "copying");
      const pinned = await buildWith(dir, LARGE, "null", "null");
      const small = await buildWith(dir, 64, "copying", "copying");
      const smallNull = await buildWith(dir, 64, "null", "null");
      if (
        !same(copying, pinned) || !same(copying, small) ||
        !same(copying, smallNull)
      ) {
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
      // D2780's witness at depth 18 under the null collector: a record type whose structural
      // spelling doubles per level, which fills the heap. About 4 s. When D2780 closes, move
      // this to the next open trap under the null collector.
      const lines = ["type A0 = {x: i32}"];
      for (let i = 1; i <= 18; i++) lines.push(`type A${i} = {l: A${i - 1}, r: A${i - 1}}`);
      lines.push("function f<T>(u: T | string): boolean { u is string }", "const a0: A0 = {x: 1}");
      for (let i = 1; i <= 18; i++) lines.push(`const a${i}: A${i} = {l: a${i - 1}, r: a${i - 1}}`);
      lines.push("print(f<A18>(a18))");
      await Deno.writeTextFile(`${dir}/main.vl`, lines.join("\n") + "\n");
      const r = await vl(
        ["build", `${dir}/main.vl`, "-o", `${dir}/main.wasm`],
        "null",
      );
      if (
        r.code !== 70 || !r.err.includes("vl: compile collector: null ") ||
        !r.err.includes("filled its 4 GiB heap") ||
        !r.err.includes(
          "`VL_COMPILE_GC=copying` compiles under a collecting one",
        )
      ) {
        throw new Error(
          `want exit 70 under null, the heap named full and the escape named, got ${show(r)}`,
        );
      }
    });
  },
});
