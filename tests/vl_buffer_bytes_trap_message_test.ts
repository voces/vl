// The SENTENCE `std:buffer`'s bulk `u8[]` pair prints before it aborts.
//
// `storeBytes`/`loadBytes` compare their range once and `__trap__("…")` when it
// does not fit, which streams the message to the host boundary and then executes
// `unreachable`. The corpus `@trap` directive cannot see that half — it inspects
// the abort, and every VL trap lowers to the same instruction — so the two
// overflow cases in `tests/cases/std/` pin THAT it refuses and this file pins
// WHAT it says. Without a message the caller reads a bare `unreachable` and has
// to guess which of the two calls in the loop above it went out of range.
//
// The witnesses are those same two corpus files, run rather than retyped: a
// paraphrase is a different program, and a message assertion over one would
// prove nothing about the case the suites grade.
//
// GATING: env-gated (`SELFHOST_NATIVE_ALIGN=1`) and needs the built binary plus
// the seed; absent either, both cases register as ignored.

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
if (GATED && !ENABLED) {
  console.warn(
    "[buffer-bytes-trap-message] skipped — missing vl binary or seed wasm.",
  );
}

// `vl run` over a corpus case. VL_STD pins std to THIS tree: an agent worktree
// symlinks the cargo target dir, so the host would otherwise resolve `std:` from
// the checkout the BINARY lives in and grade the wrong `std/buffer.vl`.
const runCase = async (
  name: string,
): Promise<{ code: number; out: string }> => {
  const { code, stdout } = await new Deno.Command(VL, {
    args: ["run", `${ROOT}/tests/cases/std/${name}`, "--compiler", COMPILER],
    stdout: "piped",
    stderr: "piped",
    cwd: ROOT,
    env: { RUST_BACKTRACE: "0", NO_COLOR: "1", VL_STD: `${ROOT}/std` },
    clearEnv: true,
  }).output();
  return { code, out: new TextDecoder().decode(stdout) };
};

const CASES: [string, string][] = [
  [
    "buffer-store-bytes-overflow-traps.vl",
    "std:buffer.storeBytes: [off, off + src.length) is not inside the buffer",
  ],
  [
    "buffer-load-bytes-overflow-traps.vl",
    "std:buffer.loadBytes: [off, off + len) is not inside the buffer",
  ],
];

for (const [name, want] of CASES) {
  Deno.test({
    name: `buffer bulk overflow names itself: ${name}`,
    ignore: !ENABLED,
    fn: async () => {
      const { code, out } = await runCase(name);
      if (code === 0) {
        throw new Error(
          `${name} exited 0 — the overflow was not refused at all.\n` +
            `  stdout: ${JSON.stringify(out)}`,
        );
      }
      if (!out.includes(want)) {
        throw new Error(
          `${name} trapped without its message.\n` +
            `  want stdout to contain: ${JSON.stringify(want)}\n` +
            `  got:                    ${JSON.stringify(out)}`,
        );
      }
    },
  });
}
