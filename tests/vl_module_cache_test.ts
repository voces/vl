// THE USER-MODULE COMPILATION CACHE — `vl run` / `vl test` keep the Cranelift compile of
// the module they run under `<cache dir>/modules/`, and the facts below are the contract:
//
//   1. A second run of the same module HITS, and prints the same output.
//   2. An entry that fails any envelope check — a flipped artifact byte, a truncated file,
//      another module's entry under this module's name — is REJECTED, the module is
//      recompiled, the run is still correct, and the entry is rewritten (the next run hits).
//   3. `VL_NO_CACHE=1` reads and writes nothing.
//   4. A module the engine refuses fails exactly as uncached and caches nothing.
//   5. Pruning retires the least-recently-used entries past `VL_CACHE_MAX_MB`, never the
//      one just written, and runs at most once a minute.
//   6. `vl test` goes through the same cache, under its own engine configuration.
//
// Evidence is `VL_CACHE_TRACE=1`'s stderr line and the files on disk, never timing. Every
// run gets a private `VL_CACHE_DIR`. DECISIONS.md, "A user module's Cranelift compile is
// cached".
//
// The `vl_` prefix is load-bearing: it is one of the globs `ci-native` auto-discovers
// (tests/ci_seed_coverage_test.ts). Gated on `SELFHOST_NATIVE_ALIGN=1` plus a built
// binary and seed, so a fresh clone self-ignores.
//
// @test-timing native

import { COMPILER, ROOT, VL, exists, nativeEnv } from "./support/tree.ts";

const GATED = Deno.env.get("SELFHOST_NATIVE_ALIGN") === "1";
const ENABLED = GATED && exists(VL) && exists(COMPILER);
if (GATED && !ENABLED) {
  console.warn("[vl-module-cache] skipped — missing vl binary or seed wasm.");
}

type Ran = { code: number; out: string; err: string; trace: string[] };

const vl = async (
  args: string[],
  cache: string,
  extra: Record<string, string> = {},
): Promise<Ran> => {
  const { code, stdout, stderr } = await new Deno.Command(VL, {
    args,
    stdout: "piped",
    stderr: "piped",
    env: nativeEnv({ VL_CACHE_DIR: cache, VL_CACHE_TRACE: "1", ...extra }),
  }).output();
  const err = new TextDecoder().decode(stderr);
  return {
    code,
    out: new TextDecoder().decode(stdout),
    err,
    trace: err.split("\n").filter((l) => l.startsWith("vl: module cache "))
      .map((l) => l.slice("vl: module cache ".length).replace(/: \/.*$/, "")),
  };
};

const expect = (got: unknown, want: unknown, what: string) => {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g !== w) throw new Error(`${what}\n  want ${w}\n  got  ${g}`);
};

const entries = (cache: string): string[] => {
  try {
    return [...Deno.readDirSync(`${cache}/modules`)].map((e) => e.name)
      .filter((n) => n.endsWith(".cwasm")).sort();
  } catch {
    return [];
  }
};

/** A private scratch dir holding one program built to `prog.wasm`. */
const setup = async (src = 'print("cached")\n') => {
  const dir = await Deno.makeTempDir({ prefix: "vl-modcache-" });
  await Deno.writeTextFile(`${dir}/prog.vl`, src);
  const { code, stderr } = await new Deno.Command(VL, {
    args: ["build", `${dir}/prog.vl`, "-o", `${dir}/prog.wasm`, "--compiler", COMPILER],
    stdout: "piped",
    stderr: "piped",
    env: nativeEnv({ VL_NO_CACHE: "1" }),
  }).output();
  if (code !== 0) throw new Error(`vl build failed: ${new TextDecoder().decode(stderr)}`);
  return { dir, cache: `${dir}/cache`, wasm: `${dir}/prog.wasm` };
};

const test = (name: string, fn: () => Promise<void>) =>
  Deno.test({ name: `native module cache: ${name}`, ignore: !ENABLED, fn });

test("a second run of the same module hits and prints the same thing", async () => {
  const { dir, cache, wasm } = await setup();
  try {
    const a = await vl(["run", wasm], cache);
    expect([a.code, a.out, a.trace], [0, "cached\n", ["miss"]], "first run");
    expect(entries(cache).length, 1, "one entry written");
    const b = await vl(["run", wasm], cache);
    expect([b.code, b.out, b.trace], [0, "cached\n", ["hit"]], "second run");
    // `vl run file.vl` caches the module it emitted, keyed on its bytes.
    const c = await vl(["run", `${dir}/prog.vl`, "--compiler", COMPILER], cache);
    const d = await vl(["run", `${dir}/prog.vl`, "--compiler", COMPILER], cache);
    expect([c.out, c.trace, d.out, d.trace], ["cached\n", ["miss"], "cached\n", ["hit"]], "run file.vl");
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
});

test("a tampered, truncated or misfiled entry is rejected and rewritten", async () => {
  const { dir, cache, wasm } = await setup();
  try {
    await vl(["run", wasm], cache);
    const [name] = entries(cache);
    const file = `${cache}/modules/${name}`;
    const good = await Deno.readFile(file);

    // One flipped byte in the middle of the ARTIFACT (past the 96-byte header).
    const flipped = good.slice();
    flipped[96 + ((flipped.length - 96) >> 1)] ^= 0xff;
    await Deno.writeFile(file, flipped);
    const a = await vl(["run", wasm], cache);
    expect([a.code, a.out, a.trace], [0, "cached\n", ["rejected (digest mismatch)"]], "flipped byte");
    expect(await Deno.readFile(file), good, "the rejected entry is rewritten");
    expect((await vl(["run", wasm], cache)).trace, ["hit"], "after the rewrite");

    // Truncated inside the artifact, and inside the header.
    await Deno.writeFile(file, good.slice(0, good.length - 1));
    expect((await vl(["run", wasm], cache)).trace, ["rejected (truncated)"], "short artifact");
    await Deno.writeFile(file, good.slice(0, 40));
    expect((await vl(["run", wasm], cache)).trace, ["rejected (bad header)"], "short header");

    // Another module's (valid) entry under this module's name.
    const other = await setup('print("other")\n');
    try {
      await vl(["run", other.wasm], cache);
      const otherName = entries(cache).find((n) => n !== name)!;
      await Deno.copyFile(`${cache}/modules/${otherName}`, file);
      const m = await vl(["run", wasm], cache);
      expect([m.out, m.trace], ["cached\n", ["rejected (key mismatch)"]], "misfiled entry");
    } finally {
      await Deno.remove(other.dir, { recursive: true });
    }
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
});

test("VL_NO_CACHE=1 reads and writes nothing", async () => {
  const { dir, cache, wasm } = await setup();
  try {
    const a = await vl(["run", wasm], cache, { VL_NO_CACHE: "1" });
    expect([a.code, a.out, a.trace], [0, "cached\n", ["off"]], "disabled run");
    expect(entries(cache), [], "no entry written");
    await vl(["run", wasm], cache); // populate
    const b = await vl(["run", wasm], cache, { VL_NO_CACHE: "1" });
    expect(b.trace, ["off"], "a populated cache is not read either");
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
});

test("a module the engine refuses fails as before and caches nothing", async () => {
  const { dir, cache } = await setup();
  try {
    // The wasm magic and version, then a type section that ends early.
    const bad = `${dir}/bad.wasm`;
    await Deno.writeFile(bad, new Uint8Array([0, 0x61, 0x73, 0x6d, 1, 0, 0, 0, 1, 5, 1, 0x60]));
    const a = await vl(["run", bad], cache);
    const b = await vl(["run", bad], cache, { VL_NO_CACHE: "1" });
    if (a.code === 0) throw new Error(`a truncated module ran: ${a.out}`);
    expect(a.code, b.code, "exit code, cached vs uncached");
    expect(a.err.replace(/^vl: module cache .*\n/m, ""), b.err.replace(/^vl: module cache .*\n/m, ""), "stderr");
    expect(entries(cache), [], "nothing cached");
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
});

test("pruning retires the least-recently-used entries, at most once a minute", async () => {
  const { dir, cache, wasm } = await setup();
  try {
    const mods = `${cache}/modules`;
    await Deno.mkdir(mods, { recursive: true });
    // Two stale entries (512 KiB each), the older one first. Contents do not matter: pruning
    // reads names, sizes and mtimes only.
    const mib = new Uint8Array(512 << 10);
    const old = new Date(Date.now() - 3 * 86400_000), older = new Date(Date.now() - 4 * 86400_000);
    await Deno.writeFile(`${mods}/older.cwasm`, mib);
    await Deno.utime(`${mods}/older.cwasm`, older, older);
    await Deno.writeFile(`${mods}/old.cwasm`, mib);
    await Deno.utime(`${mods}/old.cwasm`, old, old);
    // A 1 MiB cap holds one stale entry beside the new one, and only the newer survives.
    await vl(["run", wasm], cache, { VL_CACHE_MAX_MB: "1" });
    const after = entries(cache);
    expect(after.includes("old.cwasm") && !after.includes("older.cwasm"), true, `LRU order (${after})`);
    expect(after.length, 2, `the new entry survives (${after})`);
    // Inside the minute, another miss does not prune — even at a cap of zero.
    const other = await setup('print("other")\n');
    try {
      await vl(["run", other.wasm], cache, { VL_CACHE_MAX_MB: "0" });
      expect(entries(cache).length, 3, "throttled");
      // An expired stamp lets the next miss prune down to just its own entry.
      const past = new Date(Date.now() - 120_000);
      await Deno.utime(`${mods}/.last-prune`, past, past);
      const third = await setup('print("third")\n');
      try {
        await vl(["run", third.wasm], cache, { VL_CACHE_MAX_MB: "0" });
        expect(entries(cache).length, 1, "pruned to the entry just written");
        expect((await vl(["run", third.wasm], cache)).trace, ["hit"], "and that entry is live");
      } finally {
        await Deno.remove(third.dir, { recursive: true });
      }
    } finally {
      await Deno.remove(other.dir, { recursive: true });
    }
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
});

test("`vl test` compiles through the same cache", async () => {
  const dir = await Deno.makeTempDir({ prefix: "vl-modcache-" });
  try {
    const file = `${ROOT}/tests/fixtures/vl-test/generic.test.vl`;
    const a = await vl(["test", file, "--compiler", COMPILER], `${dir}/cache`);
    const b = await vl(["test", file, "--compiler", COMPILER], `${dir}/cache`);
    expect([a.trace, b.trace, a.code === b.code, a.out === b.out], [["miss"], ["hit"], true, true], "vl test");
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
});
