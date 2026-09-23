// A SOURCE LARGER THAN 8M CODE POINTS COMPILES (D1975, reported by plumb as PL-002).
//
// The compile store runs under the null collector, whose largest single allocation is
// 64 MiB. The host stages a source into the seed as UTF-32 code points, and the seed used
// to collect them into ONE `i32[]` — which `.push`'s 2x growth takes to 2^24 slots (64
// MiB) as soon as the source passes 2^23 code points. The trap was immediate and
// independent of what the source said. `strutil.CpAcc` now holds the stream as strings of
// at most 1M code points, joined once.
//
// WHY A COMMENT AND NOT PLUMB'S PROGRAM. What crossed the bound is the LENGTH of the
// source, not its content, so a 9M-character comment reaches the old trap through the
// same channel in ~0.3 s and ~150 MB, where the 11.6 MB program plumb filed takes ~20 s
// and ~3 GB. Each case was graded against the pre-fix seed: the two `run` cases exited
// 70 with `allocation size too large`. `vl check` is here for its channel
// (`cliResultLoad`) — it runs under a collecting collector and passed before the fix too.
//
// A NON-ASCII STRING AFTER THE FIRST CHUNK BOUNDARY proves the chunks join in order and
// that no code point is re-encoded at a boundary.
//
// GATING: env-gated (`SELFHOST_NATIVE_ALIGN=1`) + needs the built binary + seed.
//
// @test-timing native

import { COMPILER, VL, exists, nativeEnv } from "./support/tree.ts";

const GATED = Deno.env.get("SELFHOST_NATIVE_ALIGN") === "1";
const ENABLED = GATED && exists(VL) && exists(COMPILER);
if (GATED && !ENABLED) {
  console.warn("[vl-large-source] skipped — missing vl binary or seed wasm.");
}

// Past 2^23 = 8,388,608 code points: the old list's next growth was to 2^24 slots.
const PAD = "// " + "x".repeat(9_000_000) + "\n";
const WANT = "héllo ☃ 1";

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
  const dir = await Deno.makeTempDir({ prefix: "vl_large_source_" });
  try {
    await fn(dir);
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
};

const expectRuns = (what: string, r: Res) => {
  if (r.code !== 0 || r.out.trim() !== WANT) {
    throw new Error(
      `${what}: want rc 0 printing ${JSON.stringify(WANT)}, got rc ${r.code}\n` +
        `stdout: ${r.out.slice(0, 400)}\nstderr: ${r.err.slice(0, 2000)}`,
    );
  }
};

Deno.test({
  name: "vl-large-source: a 9M-code-point single file runs (the `srcLoad` channel)",
  ignore: !ENABLED,
  fn: async () => {
    await withDir(async (dir) => {
      const prog = `${dir}/big.vl`;
      await Deno.writeTextFile(prog, PAD + `print("héllo ☃ " + "1")\n`);
      expectRuns("vl run big.vl", await vl(["run", prog]));
    });
  },
});

Deno.test({
  name: "vl-large-source: a 9M-code-point imported module runs (the `modSrcLoad` channel)",
  ignore: !ENABLED,
  fn: async () => {
    await withDir(async (dir) => {
      await Deno.writeTextFile(
        `${dir}/dep.vl`,
        PAD + `export function greet(): string { "héllo ☃ 1" }\n`,
      );
      const prog = `${dir}/main.vl`;
      await Deno.writeTextFile(prog, `import { greet } from "./dep"\nprint(greet())\n`);
      expectRuns("vl run main.vl", await vl(["run", prog]));
    });
  },
});

Deno.test({
  name: "vl-large-source: `vl check` reads a 9M-code-point file (the `cliResultLoad` channel)",
  ignore: !ENABLED,
  fn: async () => {
    await withDir(async (dir) => {
      const prog = `${dir}/big.vl`;
      await Deno.writeTextFile(prog, PAD + `print("héllo ☃ " + "1")\n`);
      const r = await vl(["check", prog]);
      if (r.code !== 0) {
        throw new Error(`vl check: want rc 0, got rc ${r.code}\n${r.out}\n${r.err.slice(0, 2000)}`);
      }
    });
  },
});
