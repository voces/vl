// NATIVE `$VL_GC` — the collector knob is a TUNING dial, never semantics.
//
// `vl run` hands the user program a wasmtime store whose collector `$VL_GC`
// selects (`auto` | `tracing` | `refcount` | `none` — see
// docs/internals/memory-gc-design.md). This suite pins the two properties that
// make it safe to expose: (a) every collector runs the same emitted module to
// the SAME observable output — the choice is throughput/pauses/footprint only —
// and (b) an unrecognized value is a loud error, not a silent fallback to the
// default (a typo must never quietly measure something else).
//
// The module is built ONCE and re-run per collector, so any difference is the
// collector's alone — codegen is byte-identical across the sweep by construction.
//
// GATING: requires the vl binary + seed wasm; absent either, every case
// registers ignored with a one-line how-to-build note.

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
const CASES = new URL("./cases/", import.meta.url);

const haveBin = exists(VL);
const haveSeed = exists(COMPILER);
const ENABLED = haveBin && haveSeed;
if (!ENABLED) {
  console.warn(
    `[native-gc] skipped — ${!haveBin ? "missing vl binary" : "missing seed wasm"}. Build:\n` +
      "  (cd scripts/vl-host && cargo build --release)\n" +
      "  scripts/fetch-seed.sh",
  );
}

// Collector-visible surface: struct allocation, growable lists, strings, maps,
// closures — i.e. every representation that lands on the GC heap.
const CASES_LIST = [
  "objects/struct.vl",
  "strings/basics.vl",
  "maps/basics.vl",
  "arrays/basics.vl",
  "functions/closure.vl",
];

const COLLECTORS = ["auto", "tracing", "refcount", "none"];

const logsOf = (s: string) =>
  [...s.matchAll(/^\s*\/\/\s*@log (.*)$/gm)].map((m) => m[1]);

const vl = async (args: string[], env: Record<string, string> = {}) => {
  const { code, stdout, stderr } = await new Deno.Command(VL, {
    args: [...args, "--compiler", COMPILER],
    stdout: "piped",
    stderr: "piped",
    env: { RUST_BACKTRACE: "0", ...env },
  }).output();
  return {
    code,
    out: new TextDecoder().decode(stdout),
    err: new TextDecoder().decode(stderr),
  };
};

for (const rel of CASES_LIST) {
  Deno.test({
    name: `native-gc: ${rel} — every $VL_GC collector reproduces @log`,
    ignore: !ENABLED,
    fn: async () => {
      const srcPath = new URL(rel, CASES).pathname;
      const want = logsOf(Deno.readTextFileSync(new URL(rel, CASES)));
      const tmp = await Deno.makeTempDir();
      try {
        const mod = `${tmp}/case.wasm`;
        const b = await vl(["build", srcPath, "-o", mod]);
        if (b.code !== 0) {
          throw new Error(`${rel}: vl build failed: ${b.err.trim().split("\n")[0]}`);
        }
        for (const gc of COLLECTORS) {
          const r = await vl(["run", mod], { VL_GC: gc });
          if (r.code !== 0) {
            throw new Error(
              `${rel}: VL_GC=${gc} exited ${r.code}: ${r.err.trim().split("\n")[0]}`,
            );
          }
          const got = r.out.length ? r.out.replace(/\n$/, "").split("\n") : [];
          if (JSON.stringify(got) !== JSON.stringify(want)) {
            throw new Error(
              `${rel}: VL_GC=${gc} changed behavior\n  want ${JSON.stringify(want)}\n  got  ${JSON.stringify(got)}`,
            );
          }
        }
      } finally {
        await Deno.remove(tmp, { recursive: true });
      }
    },
  });
}

Deno.test({
  name: "native-gc: an unknown $VL_GC is a loud error, not a silent default",
  ignore: !ENABLED,
  fn: async () => {
    const r = await vl(["run", "-e", "print(1)"], { VL_GC: "nonesuch" });
    if (r.code === 0) {
      throw new Error("VL_GC=nonesuch was accepted; expected a nonzero exit");
    }
    if (!r.err.includes("VL_GC")) {
      throw new Error(`error does not name the variable: ${r.err.trim().split("\n")[0]}`);
    }
  },
});
