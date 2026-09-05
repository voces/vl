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

export const ROOT = new URL("../../", import.meta.url).pathname.replace(/\/$/, "");
export const VL = `${ROOT}/scripts/vl-host/target/release/vl`;
export const COMPILER = `${ROOT}/build/vl-compiler.wasm`;
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

/**
 * The environment a native `vl` spawn takes: `RUST_BACKTRACE` holds a host panic
 * to one line, and `VL_STD` / `VL_COMPILER_WASM` pin both resolutions to THIS
 * tree. `Deno.Command` merges these over the inherited environment.
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
  ...extra,
});
