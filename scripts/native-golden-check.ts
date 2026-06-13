// NATIVE golden byte-tripwire — the always-on byte gate for emitted wasm. The
// deno-side golden pin (`tests/selfhost_emit_program_test.ts`) is
// SELFHOST_DENO_RUN-gated; this no-TS check covers the default CI path cheaply.
// The goldens are a NATIVE SELF-SNAPSHOT (pinned
// from the self-emitter — see the UPDATE_GOLDENS note in
// `tests/selfhost_emit_fixpoint_test.ts`), so the direct assertion is: `vl build`
// each golden source with the current seed and compare byte-for-byte against
// `tests/golden/<name>.wasm`. ~1s total; runs in ci-native after the fixpoint.
//
// Re-pin (a DELIBERATE, reviewed act — a refactor must show zero drift):
//   UPDATE_GOLDENS=1 deno run -A scripts/native-golden-check.ts
//
// Prereqs: scripts/vl-host built + a fresh seed (`bash scripts/refresh-compiler.sh`).

import { GOLDENS } from "../tests/selfhost/goldens.ts";

const root = new URL("..", import.meta.url).pathname;
const vl = Deno.env.get("VL") ?? `${root}scripts/vl-host/target/release/vl`;
const seed = Deno.env.get("SEED") ?? `${root}build/vl-compiler.wasm`;
const update = Deno.env.get("UPDATE_GOLDENS") === "1";

const tmp = Deno.makeTempDirSync({ prefix: "vl-golden-" });
let failed = 0;
for (const g of GOLDENS) {
  const srcPath = `${tmp}/${g.name}.vl`;
  const outPath = `${tmp}/${g.name}.wasm`;
  Deno.writeTextFileSync(srcPath, g.src);
  const cmd = new Deno.Command(vl, {
    args: ["build", srcPath, "-o", outPath, "--compiler", seed],
    stdout: "piped",
    stderr: "piped",
  });
  const { code, stderr } = cmd.outputSync();
  if (code !== 0) {
    console.error(`${g.name}: vl build FAILED\n${new TextDecoder().decode(stderr)}`);
    failed++;
    continue;
  }
  const actual = Deno.readFileSync(outPath);
  const goldenPath = `${root}tests/golden/${g.name}.wasm`;
  if (update) {
    Deno.writeFileSync(goldenPath, actual);
    console.log(`${g.name}: re-pinned (${actual.length} bytes)`);
    continue;
  }
  const expected = Deno.readFileSync(goldenPath);
  let diffAt = -1;
  const n = Math.min(expected.length, actual.length);
  for (let i = 0; i < n; i++) {
    if (expected[i] !== actual[i]) {
      diffAt = i;
      break;
    }
  }
  if (diffAt < 0 && expected.length !== actual.length) diffAt = n;
  if (diffAt >= 0) {
    console.error(
      `${g.name}: DIFFERS at byte ${diffAt} (golden ${expected.length}b, built ${actual.length}b)`,
    );
    failed++;
  } else {
    console.log(`${g.name}: ok (${actual.length} bytes)`);
  }
}
Deno.removeSync(tmp, { recursive: true });
if (failed > 0) {
  console.error(`NATIVE GOLDEN CHECK FAILED: ${failed}/${GOLDENS.length} differ`);
  Deno.exit(1);
}
console.log(`NATIVE GOLDEN CHECK OK: ${GOLDENS.length}/${GOLDENS.length} byte-identical`);
