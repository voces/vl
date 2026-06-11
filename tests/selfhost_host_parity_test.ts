// NATIVE ↔ HOST verdict parity for the numeric conversion lattice.
//
// The corpus directives (and the `@run`/verdict alignment suites) don't exercise
// most scalar→scalar numeric conversions, so a divergence in the implicit-widening
// rule between the self-hosted checker (native `vl check`) and the host TS checker
// (`checkOnly`) could go unnoticed — exactly how the lossy i32→f32 / i64→f64 edges'
// mislabeling surfaced. This suite locks the full 4×4 numeric conversion matrix:
// for `const a: FROM = …; const x: TO = a`, the NATIVE verdict, the HOST verdict,
// and the documented SPEC verdict must all agree. So it catches both a native↔host
// divergence AND a silent drift of the shared rule.
//
// The widening rule (B2, `numWidensName`) permits only the LOSSLESS edges:
//   accept  i32→i64, i32→f64, f32→f64   (+ identity)
//   reject  every narrowing (i64→f32, f64→f32, …), any float→integer, AND the
//           lossy widenings i32→f32 (>2^24) and i64→f64 (>2^53) — those need an
//           explicit conversion (no syntax for it yet).
//
// GATING: env-gated (`SELFHOST_NATIVE_ALIGN=1`) AND requires the built vl binary +
// seed wasm; absent either, every case registers ignored with a build note.

import { checkOnly } from "../compiler/compile.ts";

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
    "[host-parity] skipped — missing vl binary or seed wasm. Build:\n" +
      "  (cd scripts/vl-host && cargo build --release)\n" +
      "  deno run -A scripts/build-compiler-wasm.ts",
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

const hostRejects = (src: string): boolean => {
  try {
    return checkOnly(src).diagnostics.some((d) => d.severity === "error");
  } catch {
    return true;
  }
};

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
      name: `host-parity: ${pair} — native == host == spec`,
      ignore: !ENABLED,
      fn: async () => {
        const src = snippet(from, to);
        const expectReject = !WIDENS.has(pair); // identity excluded above
        const host = hostRejects(src);
        const native = await nativeRejects(src);
        if (native !== host) {
          throw new Error(
            `${pair}: native↔host DIVERGENCE — native ${native ? "REJECT" : "accept"}, ` +
              `host ${host ? "REJECT" : "accept"}`,
          );
        }
        if (native !== expectReject) {
          throw new Error(
            `${pair}: both compilers ${native ? "REJECT" : "accept"}, but the spec lattice ` +
              `expects ${expectReject ? "REJECT" : "accept"} — rule drift (update WIDENS or the checker)`,
          );
        }
      },
    });
  }
}
