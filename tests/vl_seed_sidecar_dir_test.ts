// THE SEED'S COMPILED FORM LIVES ONLY IN THE PRIVATE SEED CACHE — the on-disk seed's `.cwasm`
// is native code, so `vl` reads and writes it only in `$VL_SEED_CACHE_DIR` (default the user
// cache's `seed/`), and only when that directory passes the module cache's check:
//
//   1. A private seed cache is used: no warning, no recompile, nothing new written. A `.cwasm`
//      planted beside the seed under the old sidecar name is neither read nor rewritten.
//   2. A group-writable seed cache is neither read nor written: the run says why on stderr,
//      compiles the seed itself, and still prints the right answer.
//
// Case 1 links the real seed cache's entries, so it compiles nothing; case 2 compiles the seed
// once. DECISIONS.md, "The seed sidecar lives only in the user's private cache".
//
// @test-timing native

import { COMPILER, exists, nativeEnv, SEED_CACHE, VL } from "./support/tree.ts";

const GATED = Deno.env.get("SELFHOST_NATIVE_ALIGN") === "1";
const ENABLED = GATED && exists(VL) && exists(COMPILER) &&
  Deno.build.os !== "windows";
if (GATED && !ENABLED) {
  console.warn(
    "[vl-seed-sidecar-dir] skipped — missing vl binary or seed wasm, or not Unix.",
  );
}

const WARN = "not caching the compiler in";

const ls = (dir: string) =>
  [...Deno.readDirSync(dir)].map((e) => e.name).sort();

const run = async (dir: string, cache: string) => {
  const { code, stdout, stderr } = await new Deno.Command(VL, {
    args: ["run", "--compiler", `${dir}/seed.wasm`, `${dir}/main.vl`],
    stdout: "piped",
    stderr: "piped",
    env: nativeEnv({ VL_NO_CACHE: "1", VL_SEED_CACHE_DIR: cache }),
  }).output();
  const dec = new TextDecoder();
  return { code, out: dec.decode(stdout), err: dec.decode(stderr) };
};

const want = (
  cond: boolean,
  what: string,
  r: { code: number; out: string; err: string },
) => {
  if (!cond) {
    throw new Error(
      `${what}; got rc ${r.code} ${JSON.stringify(r.out)}\n${r.err}`,
    );
  }
};

Deno.test({
  name:
    "seed cache: used when private, ignored when group-writable, never beside the seed",
  ignore: !ENABLED,
  async fn() {
    const dir = await Deno.makeTempDir({ prefix: "vl-seed-cache-" });
    try {
      const seedDir = `${dir}/checkout`, cache = `${dir}/cache`;
      await Deno.mkdir(seedDir, { mode: 0o700 });
      await Deno.mkdir(cache, { mode: 0o700 });
      await Deno.copyFile(COMPILER, `${seedDir}/seed.wasm`);
      await Deno.writeTextFile(`${seedDir}/main.vl`, 'print("sidecar")\n');
      const listed = new TextDecoder().decode(
        (await new Deno.Command(VL, {
          args: ["seed", "--cache-files", "--compiler", COMPILER],
          stdout: "piped",
          env: nativeEnv(),
        }).output()).stdout,
      ).split("\n").filter((l) => l);
      if (listed.length === 0) {
        throw new Error(
          `no entry for ${COMPILER} in ${SEED_CACHE}: run the seed once first`,
        );
      }
      const planted: string[] = [];
      for (const path of listed) {
        const name = path.slice(path.lastIndexOf("/") + 1);
        await Deno.symlink(path, `${cache}/${name}`);
        const [, key, tag] = name.match(/^seed-([0-9a-f]+)-(.+)\.cwasm$/)!;
        planted.push(`seed.wasm.${key}.${tag}.cwasm`);
        await Deno.writeTextFile(
          `${seedDir}/seed.wasm.${key}.${tag}.cwasm`,
          "planted",
        );
      }
      const cached = ls(cache), beside = ls(seedDir);

      const priv = await run(seedDir, cache);
      want(
        priv.code === 0 && priv.out === "sidecar\n" && !priv.err.includes(WARN),
        '1: want rc 0, "sidecar", no warning',
        priv,
      );
      want(
        JSON.stringify(ls(cache)) === JSON.stringify(cached),
        `1: a hit writes nothing new to the seed cache (${ls(cache)})`,
        priv,
      );

      await Deno.chmod(cache, 0o775);
      const open = await run(seedDir, cache);
      want(
        open.code === 0 && open.out === "sidecar\n" && open.err.includes(WARN),
        '2: want rc 0, "sidecar", the warning',
        open,
      );
      want(
        JSON.stringify(ls(cache)) === JSON.stringify(cached),
        "2: nothing is written to a group-writable seed cache",
        open,
      );

      const after = ls(seedDir).filter((n) => !n.endsWith(".key"));
      if (JSON.stringify(after) !== JSON.stringify(beside)) {
        throw new Error(
          `no run writes beside the seed: want ${beside}, got ${after}`,
        );
      }
      for (const name of planted) {
        if (await Deno.readTextFile(`${seedDir}/${name}`) !== "planted") {
          throw new Error(`${name} beside the seed was rewritten`);
        }
      }
    } finally {
      await Deno.chmod(`${dir}/cache`, 0o700).catch(() => {});
      await Deno.remove(dir, { recursive: true });
    }
  },
});
