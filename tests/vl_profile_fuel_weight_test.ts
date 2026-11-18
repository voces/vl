// `VL_PROFILE_GUEST_FUEL=1` under `$VL_FUEL=1` weighs each guest-profile sample by the fuel burned
// since the one before, and the tail after the last as one more, so the weights sum to the run's
// `[fuel] guest` total exactly and a phase's share is its fuel
// (scripts/perf/profile-phases.vl `--weighted`). Without it the weights are time.
import { filePath } from "./support/filePath.ts";
const ROOT = filePath(new URL("..", import.meta.url)).replace(/[\\/]$/, "");
const VL = `${ROOT}/scripts/vl-host/target/release/vl${
  Deno.build.os === "windows" ? ".exe" : ""
}`;
const COMPILER = `${ROOT}/build/vl-compiler.wasm`;
const SRC = "scripts/goal-scoreboard.vl";

const exists = (p: string) => {
  try {
    Deno.statSync(p);
    return true;
  } catch {
    return false;
  }
};
const ENABLED = exists(VL) && exists(COMPILER);

// The run's fuel and its profile's weight total.
const profiled = async (dir: string, byFuel: boolean) => {
  const json = `${dir}/p${byFuel ? "f" : "t"}.json`;
  const env: Record<string, string> = {
    NO_COLOR: "1",
    VL_STD: `${ROOT}/std`,
    VL_FUEL: "1",
    VL_PROFILE_GUEST: json,
  };
  if (byFuel) env.VL_PROFILE_GUEST_FUEL = "1";
  const { code, stderr } = await new Deno.Command(VL, {
    args: ["build", SRC, "--compiler", COMPILER, "-o", `${dir}/o.wasm`],
    cwd: ROOT,
    stdout: "piped",
    stderr: "piped",
    env,
  }).output();
  const text = new TextDecoder().decode(stderr);
  if (code !== 0) throw new Error(`build failed (${code}):\n${text}`);
  const m = text.match(/^\[fuel\] guest: (\d+)$/m);
  if (!m) throw new Error(`want a [fuel] line, got:\n${text}`);
  const samples = JSON.parse(Deno.readTextFileSync(json)).threads[0].samples;
  const w: (number | null)[] = samples.threadCPUDelta ?? [];
  return {
    fuel: Number(m[1]),
    weight: w.reduce((a: number, x) => a + (x ?? 0), 0),
    n: samples.stack.length,
  };
};

Deno.test({
  name:
    "profile fuel weights: they sum to the run's fuel, and time weights do not",
  ignore: !ENABLED,
  fn: async () => {
    const dir = await Deno.makeTempDir({ prefix: "vl_prof_fuel_" });
    try {
      const f = await profiled(dir, true);
      if (f.n < 20) {
        throw new Error(`want at least 20 samples to weigh, got ${f.n}`);
      }
      if (f.weight !== f.fuel) {
        throw new Error(
          `want weights summing to the fuel exactly: fuel ${f.fuel}, weights ${f.weight}`,
        );
      }
      const t = await profiled(dir, false);
      if (Math.abs(t.weight - t.fuel) <= 0.05 * t.fuel) {
        throw new Error(
          `want time weights far from the fuel (the control): fuel ${t.fuel}, weights ${t.weight}`,
        );
      }
    } finally {
      await Deno.remove(dir, { recursive: true });
    }
  },
});
