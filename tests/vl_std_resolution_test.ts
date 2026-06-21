// NATIVE `std:` resolution semantics — the SELF-HOSTED driver
// (`compiler/driver.vl`), exercised end to end through the native `vl`
// binary over `VL_STD` fixtures (the host maps a `std:<name>` key to
// `$VL_STD/<name>.vl`). This is the native port of the retired TS
// `std_resolution_test.ts` (which drove the now-doomed `compiler/modules.ts`
// `resolveSpecifier`/`loadProgram`): it asserts the SHIPPING resolver's behavior,
// not the TS host's. Covers (docs/std-design.md D2):
//   • a well-formed `std:` chain (incl. std-importing-std) resolves clean;
//   • the std-internal guard — a RELATIVE import inside a std module is an
//     unsupported-specifier error (std imports std via `std:` only);
//   • malformed `std:` shapes and bare specifiers stay unsupported.
// The end-to-end happy path is also pinned by the corpus (`modules/std-basic`,
// `modules/std-unknown`); the std-internal guard has no corpus fixture (it needs
// a std module that imports relatively, which can't live in the real `std/`), so
// THIS is its only automated coverage.
//
// GATING: same as the other `vl_*`/`selfhost_native_*` suites — env-gated
// (`SELFHOST_NATIVE_ALIGN=1`) AND requires the built binary + seed wasm, so it
// self-ignores on a fresh clone and runs in `ci-native` (which has a seed).

const exists = (p: string): boolean => {
  try {
    Deno.statSync(p);
    return true;
  } catch {
    return false;
  }
};

const ROOT = new URL("../", import.meta.url).pathname.replace(/\/$/, "");
const VL = `${ROOT}/scripts/vl-host/target/release/vl`;
const COMPILER = `${ROOT}/build/vl-compiler.wasm`;

const GATED = Deno.env.get("SELFHOST_NATIVE_ALIGN") === "1";
const ENABLED = GATED && exists(VL) && exists(COMPILER);
if (GATED && !ENABLED) console.warn("[vl-std-resolution] skipped — missing vl binary or seed wasm.");

/** `vl check <entry>` with `VL_STD` pinned to a fixture std dir. */
const check = async (
  entry: string,
  stdDir: string,
): Promise<{ code: number; text: string }> => {
  const { code, stdout, stderr } = await new Deno.Command(VL, {
    args: ["check", entry, "--compiler", COMPILER],
    stdout: "piped",
    stderr: "piped",
    env: { RUST_BACKTRACE: "0", NO_COLOR: "1", VL_STD: stdDir },
  }).output();
  const dec = new TextDecoder();
  return { code, text: dec.decode(stdout) + dec.decode(stderr) };
};

/** Build a throwaway `{ std: <VL_STD dir>, entry: <entry .vl path> }` workspace. */
const workspace = async (
  std: Record<string, string>,
  entrySrc: string,
): Promise<{ dir: string; stdDir: string; entry: string }> => {
  const dir = await Deno.makeTempDir({ prefix: "vl_std_res_" });
  const stdDir = `${dir}/std`;
  await Deno.mkdir(stdDir, { recursive: true });
  for (const [name, src] of Object.entries(std)) {
    const path = `${stdDir}/${name}.vl`;
    await Deno.mkdir(path.slice(0, path.lastIndexOf("/")), { recursive: true });
    await Deno.writeTextFile(path, src);
  }
  const entry = `${dir}/main.vl`;
  await Deno.writeTextFile(entry, entrySrc);
  return { dir, stdDir, entry };
};

Deno.test({
  name: "vl-std: a well-formed std: chain (incl. std-importing-std) resolves clean",
  ignore: !ENABLED,
  fn: async () => {
    const { dir, stdDir, entry } = await workspace(
      {
        outerseed: 'import { inner } from "std:innerseed"\n\nexport function outer(): i32 {\n  return inner() + 1\n}\n',
        innerseed: "export function inner(): i32 {\n  return 41\n}\n",
      },
      'import { outer } from "std:outerseed"\n\nprint(outer())\n',
    );
    try {
      const r = await check(entry, stdDir);
      if (r.code !== 0) throw new Error(`std-to-std chain should check clean, got code ${r.code}:\n${r.text}`);
    } finally {
      await Deno.remove(dir, { recursive: true });
    }
  },
});

Deno.test({
  name: "vl-std: a relative import INSIDE a std module is rejected (the std-internal guard)",
  ignore: !ENABLED,
  fn: async () => {
    const { dir, stdDir, entry } = await workspace(
      {
        badseed: 'import { helper } from "./helper"\n\nexport function broken(): i32 {\n  return helper()\n}\n',
      },
      'import { broken } from "std:badseed"\n\nprint(broken())\n',
    );
    try {
      const r = await check(entry, stdDir);
      if (r.code === 0) throw new Error(`expected the std-internal guard error, but check passed:\n${r.text}`);
      if (
        !r.text.includes('Unsupported import specifier "./helper"') ||
        !r.text.includes("std modules import only via `std:` specifiers")
      ) {
        throw new Error(`expected the std-internal guard diagnostic, got:\n${r.text}`);
      }
    } finally {
      await Deno.remove(dir, { recursive: true });
    }
  },
});

Deno.test({
  name: "vl-std: malformed std: shapes and bare specifiers stay unsupported",
  ignore: !ENABLED,
  fn: async () => {
    // `std:Fmt` (uppercase — malformed) and a bare `fmt` both hit the
    // unsupported-specifier branch (not the std-internal guard).
    for (const spec of ["std:Fmt", "fmt"]) {
      const { dir, stdDir, entry } = await workspace(
        {},
        `import { x } from "${spec}"\n\nprint(x())\n`,
      );
      try {
        const r = await check(entry, stdDir);
        if (r.code === 0) throw new Error(`\`${spec}\` should be unsupported, but check passed:\n${r.text}`);
        if (!r.text.includes("Unsupported import specifier")) {
          throw new Error(`\`${spec}\` should report an unsupported specifier, got:\n${r.text}`);
        }
      } finally {
        await Deno.remove(dir, { recursive: true });
      }
    }
  },
});
