// THE SEED SIDECAR IS READ ONLY FROM A PRIVATE DIRECTORY — the on-disk seed's `.cwasm` sidecar
// is native code, so `vl` loads it only when the seed's directory passes the user-module cache's
// check (owned by this user, not writable by group or others):
//
//   1. In a private directory the sidecars beside the seed are used: no warning, no recompile.
//   2. In a group-writable one they are neither read nor rewritten: the run says why on stderr,
//      compiles the seed itself, and still prints the right answer.
//
// The seed is copied and its sidecars symlinked, so case 1 compiles nothing; case 2 compiles the
// seed once. DECISIONS.md, "The seed sidecar is trusted by its directory, not by a digest".
//
// The `vl_` prefix puts this in `ci-native`. Gated on `SELFHOST_NATIVE_ALIGN=1` plus a built
// binary and seed; the check is Unix only.
//
// @test-timing native

import { COMPILER, exists, nativeEnv, VL } from "./support/tree.ts";

const GATED = Deno.env.get("SELFHOST_NATIVE_ALIGN") === "1";
const ENABLED = GATED && exists(VL) && exists(COMPILER) &&
  Deno.build.os !== "windows";
if (GATED && !ENABLED) {
  console.warn(
    "[vl-seed-sidecar-dir] skipped — missing vl binary or seed wasm, or not Unix.",
  );
}

const WARN = "not caching the compiler beside";

/** A 0700 dir holding a copy of the seed, its sidecars symlinked, and a program. */
const setup = async (): Promise<{ dir: string; sidecars: string[] }> => {
  const dir = await Deno.makeTempDir({ prefix: "vl-sidecar-dir-" });
  await Deno.copyFile(COMPILER, `${dir}/seed.wasm`);
  const seedDir = COMPILER.slice(0, COMPILER.lastIndexOf("/"));
  const stem = COMPILER.slice(COMPILER.lastIndexOf("/") + 1);
  const sidecars: string[] = [];
  for (const e of Deno.readDirSync(seedDir)) {
    if (e.name.startsWith(`${stem}.`) && e.name.endsWith(".cwasm")) {
      const name = `seed.wasm.${e.name.slice(stem.length + 1)}`;
      await Deno.symlink(`${seedDir}/${e.name}`, `${dir}/${name}`);
      sidecars.push(name);
    }
  }
  await Deno.writeTextFile(`${dir}/main.vl`, 'print("sidecar")\n');
  return { dir, sidecars };
};

const run = async (dir: string) => {
  const { code, stdout, stderr } = await new Deno.Command(VL, {
    args: ["run", "--compiler", `${dir}/seed.wasm`, `${dir}/main.vl`],
    stdout: "piped",
    stderr: "piped",
    env: nativeEnv({ VL_NO_CACHE: "1" }),
  }).output();
  const dec = new TextDecoder();
  return { code, out: dec.decode(stdout), err: dec.decode(stderr) };
};

Deno.test({
  name:
    "seed sidecar: used from a private dir, ignored in a group-writable one",
  ignore: !ENABLED,
  async fn() {
    const { dir, sidecars } = await setup();
    try {
      if (sidecars.length === 0) {
        throw new Error(
          `no sidecar beside ${COMPILER} to reuse: run the seed once first`,
        );
      }
      const priv = await run(dir);
      if (
        priv.code !== 0 || priv.out !== "sidecar\n" || priv.err.includes(WARN)
      ) {
        throw new Error(
          `1: want rc 0, "sidecar", no warning; got rc ${priv.code} ${
            JSON.stringify(priv.out)
          }\n${priv.err}`,
        );
      }
      // A planted sidecar under every name the run could look up; none may be read or replaced.
      for (const name of sidecars) {
        await Deno.remove(`${dir}/${name}`);
        await Deno.writeTextFile(`${dir}/${name}`, "planted");
      }
      await Deno.chmod(dir, 0o775);
      const open = await run(dir);
      if (
        open.code !== 0 || open.out !== "sidecar\n" || !open.err.includes(WARN)
      ) {
        throw new Error(
          `2: want rc 0, "sidecar", the warning; got rc ${open.code} ${
            JSON.stringify(open.out)
          }\n${open.err}`,
        );
      }
      for (const name of sidecars) {
        const body = await Deno.readTextFile(`${dir}/${name}`);
        if (body !== "planted") {
          throw new Error(`2: ${name} was rewritten in a group-writable dir`);
        }
      }
    } finally {
      await Deno.chmod(dir, 0o700).catch(() => {});
      await Deno.remove(dir, { recursive: true });
    }
  },
});
