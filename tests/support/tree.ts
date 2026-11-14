// THE TREE UNDER TEST — the repo root, the paths derived from it, and the
// environment a native `vl` spawn needs. One derivation, imported.
//
// WHY THE STD PIN IS NOT OPTIONAL. `vl` resolves `std:` from the EXE's checkout
// (`std_source`, scripts/vl-host/src/main.rs), and every agent worktree symlinks
// `scripts/vl-host/target` into the main repo — so a bare `deno test` from a
// worktree spawns a binary that reads the MAIN checkout's `std/`, not the one
// beside the test file, and grades the wrong tree in silence. `scripts/gate.sh`
// exports `VL_STD` for exactly this reason, which is why the gates stay honest
// while a bare `deno test` does not. `import.meta.url` is the right anchor
// because it is the tree the TEST file lives in. See CLAUDE.md, "`vl` resolves
// `std:` from the EXE's checkout — a worktree probe measures the WRONG std".

import { filePath } from "./filePath.ts";
export const ROOT = filePath(new URL("../../", import.meta.url)).replace(
  /[\\/]$/,
  "",
);
export const VL = `${ROOT}/scripts/vl-host/target/release/vl${
  Deno.build.os === "windows" ? ".exe" : ""
}`;
export const COMPILER = `${ROOT}/build/vl-compiler.wasm`;

/** A binaryen CLI tool: from `$VL_BINARYEN` (a directory of the native release
 * binaries, the same version as package.json's) when set, else from
 * `node_modules/.bin`, which is not on PATH. npm's build is binaryen compiled to
 * JS/wasm under node: the modules it writes are byte-identical, but each call pays
 * node's start-up and `-O` runs about 5x slower. ci-native has no `node_modules`, so
 * there `$VL_BINARYEN` is the only binaryen. On Windows `wasm-dis` comes from npm: the
 * native one prints `\r\n` there, and the shape suites match text by line; npm's
 * spawnable shim is `<tool>.cmd`. */
export const binaryen = (tool: string): string => {
  const win = Deno.build.os === "windows";
  const native = Deno.env.get("VL_BINARYEN");
  if (native && !(win && tool === "wasm-dis")) {
    return `${native}/${tool}${win ? ".exe" : ""}`;
  }
  return `${ROOT}/node_modules/.bin/${tool}${win ? ".cmd" : ""}`;
};

/** The fastest `wasm-dis` available: the native one when `$VL_BINARYEN` names it.
 * Its text needs `\r\n` folded on Windows, which the host (`--wat`) and `wasmDis` do. */
export const hostWasmDis = (): string => {
  const native = Deno.env.get("VL_BINARYEN");
  if (!native) return binaryen("wasm-dis");
  return `${native}/wasm-dis${Deno.build.os === "windows" ? ".exe" : ""}`;
};

type DisOutput = {
  code: number;
  success: boolean;
  stdout: Uint8Array;
  stderr: Uint8Array;
};
const lfOutput = (o: Deno.CommandOutput): DisOutput => ({
  code: o.code,
  success: o.success,
  stdout: new TextEncoder().encode(
    new TextDecoder().decode(o.stdout).replaceAll("\r\n", "\n"),
  ),
  stderr: o.stderr,
});

/** `wasm-dis <args>`, shaped like `Deno.Command`'s output, with `\n` line ends in its
 * stdout on every platform, so a suite matching the text by line can use the native
 * binary. */
export const wasmDis = async (args: string[]): Promise<DisOutput> =>
  lfOutput(
    await new Deno.Command(hostWasmDis(), {
      args,
      stdout: "piped",
      stderr: "piped",
    })
      .output(),
  );

/** `wasmDis`, synchronously. */
export const wasmDisSync = (args: string[]): DisOutput =>
  lfOutput(
    new Deno.Command(hostWasmDis(), { args, stdout: "piped", stderr: "piped" })
      .outputSync(),
  );

export const STD = `${ROOT}/std`;

/** Whether `p` exists. `Deno.statSync` throws on a miss; this is the test suite's
 * standing gating predicate for the binary and the seed. */
export const exists = (p: string): boolean => {
  try {
    Deno.statSync(p);
    return true;
  } catch {
    return false;
  }
};

/** Whether the seed at `p` exists, for a seed-backed test's `ignore`. A fresh clone skips;
 * under `SELFHOST_NATIVE_ALIGN=1` a missing seed throws, because that run promised to test it. */
export const seedPresent = (p: string): boolean => {
  if (exists(p)) return true;
  if (Deno.env.get("SELFHOST_NATIVE_ALIGN") === "1") {
    throw new Error(
      `SELFHOST_NATIVE_ALIGN=1 but the seed is missing: ${p}. Build it with scripts/refresh-compiler.sh; a gated run does not skip.`,
    );
  }
  return false;
};

/** `{ VL_ISA }` when the run pins the seed engine's ISA, else `{}`. */
export const isaEnv = (): Record<string, string> => {
  const isa = Deno.env.get("VL_ISA");
  return isa ? { VL_ISA: isa } : {};
};

/** The seed cache every native spawn shares: `$VL_SEED_CACHE_DIR`, else the host's default for
 * this process's environment, pinned so a test's private `$VL_CACHE_DIR` does not make each run
 * recompile the seed. A test of the seed cache itself overrides it. */
const env = (k: string) => Deno.env.get(k) || undefined;
const cacheRoot = (): string => {
  const xdg = env("XDG_CACHE_HOME"), home = env("HOME"), local = env("LOCALAPPDATA");
  if (env("VL_CACHE_DIR")) return env("VL_CACHE_DIR")!;
  if (xdg) return `${xdg}/vl`;
  if (home) return `${home}/.cache/vl`;
  return `${local ?? Deno.makeTempDirSync()}/vl`;
};
export const SEED_CACHE = env("VL_SEED_CACHE_DIR") ?? `${cacheRoot()}/seed`;

/** A 0700 seed cache at `dir` linking every entry of SEED_CACHE, for a case that compiles a
 * throwaway seed: its entry lands there instead of taking a slot in the user's cache. */
export const privateSeedCache = (dir: string): string => {
  Deno.mkdirSync(dir, { mode: 0o700 });
  for (const e of Deno.readDirSync(SEED_CACHE)) {
    Deno.symlinkSync(`${SEED_CACHE}/${e.name}`, `${dir}/${e.name}`);
  }
  return dir;
};

/**
 * The environment a native `vl` spawn takes: `RUST_BACKTRACE` holds a host panic
 * to one line, and `VL_STD` / `VL_COMPILER_WASM` pin both resolutions to THIS
 * tree. `VL_ISA` (the pinned ISA of the seed and program engines)
 * rides along when set, so a `clearEnv` spawn reads the sidecar the run warmed
 * instead of JITing the seed. `Deno.Command` merges these over the inherited
 * environment.
 *
 * `VL_COMPILER_WASM` changes which seed NO caller reads: `--compiler` wins over
 * the variable in the host's seed ladder, so a spawn that passes the flag is
 * unaffected and one that does not now names the same file the flag would have.
 * `extra` is spread LAST, so a test probing the resolution ladder itself keeps
 * its own `VL_STD` / `VL_COMPILER_WASM`, and a test that must see colour simply
 * omits `NO_COLOR`.
 */
export const nativeEnv = (
  extra: Record<string, string> = {},
): Record<string, string> => ({
  RUST_BACKTRACE: "0",
  VL_STD: STD,
  VL_COMPILER_WASM: COMPILER,
  VL_SEED_CACHE_DIR: SEED_CACHE,
  ...isaEnv(),
  ...extra,
});
