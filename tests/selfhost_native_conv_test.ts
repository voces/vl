// NATIVE verdict ↔ SPEC for the numeric conversion lattice.
//
// The corpus directives (and the `@run`/verdict alignment suites) don't exercise
// most scalar→scalar numeric conversions, so a drift in the implicit-widening
// rule of the self-hosted checker (native `vl check`) could go unnoticed —
// exactly how the lossy i32→f32 / i64→f64 edges' mislabeling surfaced. This suite
// locks the full 4×4 numeric conversion matrix: for `const a: FROM = …;
// const x: TO = a`, the NATIVE verdict must match the documented SPEC verdict.
//
// (Originally this also ran the TS host checker as a third column — the
// native↔host parity oracle. With the TS compiler retired (kill-TS), the seed IS
// the compiler, so the test pins the native verdict directly against the spec
// lattice; nothing to be parity-checked against anymore.)
//
// The widening rule (B2, `numWidensName`) permits only the LOSSLESS edges:
//   accept  i32→i64, i32→f64, f32→f64   (+ identity)
//   reject  every narrowing (i64→f32, f64→f32, …), any float→integer, AND the
//           lossy widenings i32→f32 (>2^24) and i64→f64 (>2^53) — those need an
//           explicit conversion (no syntax for it yet).
//
// GATING: env-gated (`SELFHOST_NATIVE_ALIGN=1`) AND requires the built vl binary +
// seed wasm; absent either, every case registers ignored with a build note.

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
    "[native-spec] skipped — missing vl binary or seed wasm. Build:\n" +
      "  (cd scripts/vl-host && cargo build --release)\n" +
      "  bash scripts/refresh-compiler.sh",
  );
}

const TYPES = ["i32", "i64", "f32", "f64"] as const;
type Ty = (typeof TYPES)[number];
const litOf = (t: Ty) => (t === "f32" || t === "f64" ? "5.0" : "5");

// The documented LOSSLESS widening edges (everything else off-diagonal rejects,
// including the lossy i32→f32 / i64→f64 widenings).
const WIDENS = new Set([
  "i32→i64", "i32→f64", "f32→f64",
]);

const snippet = (from: Ty, to: Ty) =>
  `const a: ${from} = ${litOf(from)}\nconst x: ${to} = a\n`;

const nativeRejects = async (src: string): Promise<boolean> => {
  const tmp = await Deno.makeTempFile({ suffix: ".vl" });
  try {
    await Deno.writeTextFile(tmp, src);
    const { code } = await new Deno.Command(VL, {
      args: ["check", tmp, "--compiler", COMPILER],
      stdout: "null",
      stderr: "null",
      env: { RUST_BACKTRACE: "0" },
    }).output();
    return code !== 0;
  } finally {
    await Deno.remove(tmp);
  }
};

for (const from of TYPES) {
  for (const to of TYPES) {
    if (from === to) continue;
    const pair = `${from}→${to}`;
    Deno.test({
      name: `native-spec: ${pair} — native == spec`,
      ignore: !ENABLED,
      fn: async () => {
        const src = snippet(from, to);
        const expectReject = !WIDENS.has(pair); // identity excluded above
        const native = await nativeRejects(src);
        if (native !== expectReject) {
          throw new Error(
            `${pair}: the compiler ${native ? "REJECTs" : "accepts"}, but the spec lattice ` +
              `expects ${expectReject ? "REJECT" : "accept"} — rule drift (update WIDENS or the checker)`,
          );
        }
      },
    });
  }
}
