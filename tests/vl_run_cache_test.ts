// `vl run` OF A SOURCE FILE THROUGH THE COMPILE CACHE (opt-in, `VL_COMPILE_CACHE=1`) — the
// `run` action kind. An unchanged re-run skips the check, the emit and, through the module
// cache, the Cranelift compile.
//
//   1. A hit prints what the cold run printed, with the same exit code, a trapping program
//      included, and its module comes out of the module cache: the run compiles nothing.
//      A miss compiles the module once, not once to decide the store and again to run it.
//   2. A MUTATION MATRIX: changing any one input class makes the next lookup MISS — the
//      entry, a module it imports, a std module it imports, a keyed variable, the seed, the
//      cwd, the entry's spelling.
//   3. Controls: an INERT variable must still HIT (a matrix that always missed would pass
//      without it), a BYPASS variable neither hits nor stores, `VL_NO_COMPILE_CACHE` turns
//      it off, and a failed compile prints its diagnostics every time and stores nothing.
//   4. A damaged result is rejected, the run compiles cold and is correct, and the entry is
//      rewritten.
//
// Evidence is the trace lines and the files on disk, never timing. Every case gets a private
// `VL_CACHE_DIR`. The population is one two-module program and the variants named here.
// DECISIONS.md, "An unchanged `vl run` is served by the compile cache".
//
// @test-timing native

import { COMPILER, ROOT, VL, exists, nativeEnv } from "./support/tree.ts";

const GATED = Deno.env.get("SELFHOST_NATIVE_ALIGN") === "1";
const ENABLED = GATED && exists(VL) && exists(COMPILER);
if (GATED && !ENABLED) {
  console.warn("[vl-run-cache] skipped — missing vl binary or seed wasm.");
}

type Ran = { code: number; out: string; err: string; trace: string[]; module: string[] };

const PREFIX = "vl: compile cache ";
const MODULE = "vl: module cache ";

/** Run `vl` with both caches traced and the compile cache on, in `cwd`, caching under `cache`. */
const vl = async (
  args: string[],
  cwd: string,
  cache: string,
  extra: Record<string, string> = {},
): Promise<Ran> => {
  const { code, stdout, stderr } = await new Deno.Command(VL, {
    args,
    cwd,
    stdout: "piped",
    stderr: "piped",
    env: nativeEnv({
      VL_CACHE_DIR: cache,
      VL_COMPILE_CACHE: "1",
      VL_COMPILE_CACHE_TRACE: "1",
      VL_COMPILE_CACHE_VERIFY: "0",
      VL_CACHE_TRACE: "1",
      NO_COLOR: "1",
      ...extra,
    }),
  }).output();
  const err = new TextDecoder().decode(stderr);
  const lines = err.split("\n");
  return {
    code,
    out: new TextDecoder().decode(stdout),
    err: lines.filter((l) => !l.startsWith(PREFIX) && !l.startsWith(MODULE)).join("\n"),
    trace: lines.filter((l) => l.startsWith(PREFIX)).map((l) => l.slice(PREFIX.length)),
    module: lines.filter((l) => l.startsWith(MODULE))
      .map((l) => l.slice(MODULE.length).replace(/: (?:\/|[A-Za-z]:[\\/]).*$/, "")),
  };
};

const expect = (got: unknown, want: unknown, what: string) => {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g !== w) throw new Error(`${what}\n  want ${w}\n  got  ${g}`);
};

const LIB = "export function twice(x: i32): i32 { return x * 2 }\n";
const MAIN = 'import { twice } from "./lib"\nprint(twice(21))\n';
const RUN = ["run", "main.vl"];

/** `<tmp>/p` holds the program; `<tmp>/cache` is the cache root. */
const setup = async (): Promise<{ tmp: string; p: string; cache: string }> => {
  const tmp = await Deno.makeTempDir({ prefix: "vl-runcache-" });
  const p = `${tmp}/p`;
  await Deno.mkdir(p);
  await Deno.writeTextFile(`${p}/lib.vl`, LIB);
  await Deno.writeTextFile(`${p}/main.vl`, MAIN);
  return { tmp, p, cache: `${tmp}/cache` };
};

const files = (cache: string): string[] => {
  try {
    return [...Deno.readDirSync(`${cache}/compile`)].map((e) => e.name)
      .filter((n) => n.endsWith(".m") || n.endsWith(".r")).sort();
  } catch {
    return [];
  }
};

/** Everything a user sees of a run: exit code, stdout, and stderr without the traces. */
const shown = (r: Ran) => [r.code, r.out, r.err];

const test = (name: string, fn: () => Promise<void>) =>
  Deno.test({ name: `native run cache: ${name}`, ignore: !ENABLED, fn });

test("a hit prints what the cold run printed, and compiles nothing", async () => {
  const { tmp, p, cache } = await setup();
  try {
    const off = await vl(RUN, p, cache, { VL_COMPILE_CACHE: "0", VL_NO_CACHE: "1" });
    expect(shown(off), [0, "42\n", ""], "uncached");
    const cold = await vl(RUN, p, cache);
    expect([cold.trace, cold.module, shown(cold)], [["miss", "stored"], ["miss"], shown(off)], "cold");
    const hit = await vl(RUN, p, cache);
    expect([hit.trace, hit.module, shown(hit)], [["hit"], ["hit"], shown(off)], "warm");
    const ver = await vl(RUN, p, cache, { VL_COMPILE_CACHE_VERIFY: "1" });
    expect([ver.trace, shown(ver)], [["hit", "verified"], shown(off)], "verify");
    // The two caches are independent: without the module cache a hit still skips the compile
    // of the program and only the Cranelift compile runs.
    const noModule = await vl(RUN, p, cache, { VL_NO_CACHE: "1" });
    expect([noModule.trace, noModule.module, shown(noModule)], [["hit"], ["off"], shown(off)], "VL_NO_CACHE");
  } finally {
    await Deno.remove(tmp, { recursive: true });
  }
});

test("a trapping program reports the same trap on a hit", async () => {
  // A compile that succeeded is stored whatever the run then does; the trap's report reads
  // the served module's own source map.
  const { tmp, p, cache } = await setup();
  try {
    await Deno.writeTextFile(`${p}/main.vl`, 'import { twice } from "./lib"\nconst a: i32[] = []\nprint(twice(a[3]))\n');
    const off = await vl(RUN, p, cache, { VL_COMPILE_CACHE: "0" });
    if (off.code === 0) throw new Error(`the control did not trap: ${off.out}`);
    const cold = await vl(RUN, p, cache);
    expect([cold.trace, shown(cold)], [["miss", "stored"], shown(off)], "cold");
    const hit = await vl(RUN, p, cache);
    expect([hit.trace, shown(hit)], [["hit"], shown(off)], "warm");
  } finally {
    await Deno.remove(tmp, { recursive: true });
  }
});

test("the mutation matrix: each input class misses", async () => {
  const { tmp, p, cache } = await setup();
  try {
    type Mutation = { args?: string[]; cwd?: string; env?: Record<string, string> };
    const rows: [string, () => Promise<Mutation>][] = [
      ["main.vl edited", async () => {
        await Deno.writeTextFile(`${p}/main.vl`, MAIN.replace("21", "20"));
        return {};
      }],
      ["lib.vl edited", async () => {
        await Deno.writeTextFile(`${p}/lib.vl`, LIB.replace("* 2", "* 3"));
        return {};
      }],
      ["a keyed variable set", () => Promise.resolve({ env: { VL_OPT_NO_FLAT: "1" } })],
      ["the cwd changed", async () => {
        const q = `${tmp}/q`;
        await Deno.mkdir(q, { recursive: true });
        for (const f of ["lib.vl", "main.vl"]) await Deno.copyFile(`${p}/${f}`, `${q}/${f}`);
        return { cwd: q };
      }],
      ["the entry spelled ./main.vl", () => Promise.resolve({ args: ["run", "./main.vl"] })],
    ];
    for (const [what, mutate] of rows) {
      await vl(RUN, p, cache);
      expect((await vl(RUN, p, cache)).trace, ["hit"], `warm before: ${what}`);
      const m = await mutate();
      const off = await vl(m.args ?? RUN, m.cwd ?? p, cache, { ...m.env, VL_COMPILE_CACHE: "0" });
      const after = await vl(m.args ?? RUN, m.cwd ?? p, cache, m.env);
      expect([after.trace, shown(after)], [["miss", "stored"], shown(off)], what);
    }
    // The edits are real: the program now prints twice(20) at three times.
    expect((await vl(RUN, p, cache)).out, "60\n", "both edits reached the output");
  } finally {
    await Deno.remove(tmp, { recursive: true });
  }
});

test("an edited std module the program imports misses; one it does not import hits", async () => {
  const { tmp, p, cache } = await setup();
  try {
    const std = `${tmp}/std`;
    await Deno.mkdir(std);
    for (const e of Deno.readDirSync(`${ROOT}/std`)) {
      if (e.isFile && e.name.endsWith(".vl")) await Deno.copyFile(`${ROOT}/std/${e.name}`, `${std}/${e.name}`);
    }
    await Deno.writeTextFile(`${p}/main.vl`, 'import { padStart } from "std:str"\nprint(padStart("7", 3, "0"))\n');
    const env = { VL_STD: std };
    await vl(RUN, p, cache, env);
    const warm = await vl(RUN, p, cache, env);
    expect([warm.trace, warm.out], [["hit"], "007\n"], "warm");
    await Deno.writeTextFile(`${std}/json.vl`, (await Deno.readTextFile(`${std}/json.vl`)) + "\n// edited\n");
    expect((await vl(RUN, p, cache, env)).trace, ["hit"], "std/json.vl edited");
    await Deno.writeTextFile(`${std}/str.vl`, (await Deno.readTextFile(`${std}/str.vl`)) + "\n// edited\n");
    expect((await vl(RUN, p, cache, env)).trace, ["miss", "stored"], "std/str.vl edited");
  } finally {
    await Deno.remove(tmp, { recursive: true });
  }
});

test("the seed's bytes are keyed, not its path", async () => {
  // Copied with its Cranelift sidecars (content-keyed, so they still apply), then
  // overwritten in place. The lookup runs before the seed loads, so a seed that cannot load
  // still shows the miss.
  const { tmp, p, cache } = await setup();
  try {
    const seed = `${tmp}/seed.wasm`;
    await Deno.copyFile(COMPILER, seed);
    const dir = COMPILER.replace(/\/[^/]*$/, ""), base = COMPILER.slice(dir.length + 1);
    for (const e of Deno.readDirSync(dir)) {
      if (e.name.startsWith(`${base}.`) && e.name.endsWith(".cwasm")) {
        await Deno.copyFile(`${dir}/${e.name}`, `${tmp}/seed.wasm${e.name.slice(base.length)}`);
      }
    }
    const env = { VL_COMPILER_WASM: seed };
    expect((await vl(RUN, p, cache, env)).trace, ["miss", "stored"], "cold");
    expect((await vl(RUN, p, cache, env)).trace, ["hit"], "warm");
    await Deno.writeFile(seed, new Uint8Array([0, 0x61, 0x73, 0x6d, 1, 0, 0, 0]));
    expect((await vl(RUN, p, cache, env)).trace[0], "miss", "the seed overwritten");
  } finally {
    await Deno.remove(tmp, { recursive: true });
  }
});

test("controls: inert hits, bypass and opt-out store nothing, a failed compile reports every time", async () => {
  const { tmp, p, cache } = await setup();
  try {
    const bypass = await vl(RUN, p, cache, { VL_FUEL: "1" });
    expect([bypass.trace, bypass.out, files(cache)], [["off (bypass VL_FUEL)"], "42\n", []], "bypass, cold");
    const optOut = await vl(RUN, p, cache, { VL_NO_COMPILE_CACHE: "1" });
    expect([optOut.trace, optOut.out, files(cache)], [["off (VL_NO_COMPILE_CACHE)"], "42\n", []], "opt-out");
    await vl(RUN, p, cache);
    expect((await vl(RUN, p, cache, { VL_COMPILE_CACHE_MAX_MB: "64" })).trace, ["hit"], "inert variable");
    const n = files(cache).length;
    const warm = await vl(RUN, p, cache, { VL_GC_STATS: "1" });
    expect([warm.trace, files(cache).length], [["off (bypass VL_GC_STATS)"], n], "bypass, warm");
    await Deno.writeTextFile(`${p}/main.vl`, 'import { twice } from "./lib"\nprint(twice("x"))\n');
    const off = await vl(RUN, p, cache, { VL_COMPILE_CACHE: "0" });
    if (off.code === 0 || !off.err.includes("error")) throw new Error(`the control compiled: ${off.err}`);
    for (const round of ["first", "second"]) {
      const bad = await vl(RUN, p, cache);
      expect([bad.trace, shown(bad), files(cache).length], [["miss"], shown(off), n], `failed compile, ${round}`);
    }
  } finally {
    await Deno.remove(tmp, { recursive: true });
  }
});

test("a damaged result is rejected, compiled cold, and rewritten", async () => {
  const { tmp, p, cache } = await setup();
  try {
    await vl(RUN, p, cache);
    const r = files(cache).find((n) => n.endsWith(".r"))!;
    const path = `${cache}/compile/${r}`;
    const good = await Deno.readFile(path);
    const bad = good.slice();
    bad[bad.length - 1] ^= 0xff;
    await Deno.writeFile(path, bad);
    const after = await vl(RUN, p, cache);
    expect([after.trace, shown(after)], [["rejected (corrupt result)", "miss", "stored"], [0, "42\n", ""]], "damaged");
    expect(await Deno.readFile(path), good, "the entry is rewritten");
    expect((await vl(RUN, p, cache)).trace, ["hit"], "the next run hits");
  } finally {
    await Deno.remove(tmp, { recursive: true });
  }
});
