// A VL script a suite runs many times, compiled ONCE per test file.
//
// `vl run <script>.vl` compiles the script on every call; `vl run <module>.wasm` runs a
// module that is already built. A suite that grades a script's behaviour across many argument
// lists builds it here and runs the module, so the compile is paid once per file instead of
// once per case. The build uses the same path, working directory, compiler and `std` the
// source run would, so the module is the one that run would have compiled. A suite that EDITS
// the script between runs (a must-red control) runs that edit from source, not from here.

import { COMPILER, nativeEnv, VL } from "./tree.ts";

const built = new Map<string, Promise<string>>();
let dir: string | undefined;

globalThis.addEventListener("unload", () => {
  if (dir === undefined) return;
  try {
    Deno.removeSync(dir, { recursive: true });
  } catch {
    // Already gone: nothing to clean.
  }
});

/** The module `vl build <script> --compiler <compiler>` writes from `cwd`, built on the first
 * call for that (script, cwd, compiler) and reused after. `compiler: null` builds with no
 * `--compiler`, for a suite whose source run passes none. Throws if the build fails. */
export const builtScript = (
  script: string,
  opts: { cwd?: string; compiler?: string | null } = {},
): Promise<string> => {
  const compiler = opts.compiler === undefined ? COMPILER : opts.compiler;
  const key = `${opts.cwd ?? ""}\0${script}\0${compiler ?? ""}`;
  let p = built.get(key);
  if (p === undefined) {
    dir ??= Deno.makeTempDirSync({ prefix: "vl_built_script_" });
    const out = `${dir}/${built.size}.wasm`;
    p = (async () => {
      const b = await new Deno.Command(VL, {
        args: ["build", script, ...(compiler === null ? [] : ["--compiler", compiler]), "-o", out],
        cwd: opts.cwd,
        stdout: "piped",
        stderr: "piped",
        env: nativeEnv(),
      }).output();
      if (b.code !== 0) {
        throw new Error(
          `vl build ${script}: exit ${b.code}\n${new TextDecoder().decode(b.stderr)}`,
        );
      }
      return out;
    })();
    built.set(key, p);
  }
  return p;
};
