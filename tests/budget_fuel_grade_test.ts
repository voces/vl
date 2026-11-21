// scripts/self-compile-time.sh grades the per-PR tier against the base master, and the ledgered
// baseline only cumulatively. Each case grades a canned stage 4 (`--pair`) with no build: the
// fuel, the base fuel and the baseline are given, so only the grading is under test.

const ROOT = new URL("../", import.meta.url).pathname;

type Case = { fuel: number; base: string; baseline: number };

async function grade(c: Case): Promise<{ code: number; out: string }> {
  const dir = await Deno.makeTempDir({ prefix: "fuel_grade_" });
  try {
    await Deno.writeTextFile(
      `${dir}/stage4.time`,
      `[fuel] guest: ${c.fuel}\n[gc] peak live after a collection: 1048576 KiB\nuser 40.0\nsys 1.0\n`,
    );
    await Deno.writeTextFile(
      `${dir}/baseline.json`,
      `{\n"fuel": ${c.baseline},\n"factor": 1.5,\n"tier": 0.01,\n"commit": "x"\n}\n`,
    );
    await Deno.writeTextFile(`${dir}/ledger.txt`, `${c.baseline}\tx\t#1\ttest baseline\n`);
    await Deno.writeTextFile(`${dir}/seed.wasm`, "");
    const env: Record<string, string> = {
      VL: "/bin/true",
      SEED: `${dir}/seed.wasm`,
      BASELINE: `${dir}/baseline.json`,
      LEDGER: `${dir}/ledger.txt`,
    };
    if (c.base === "none") env.SELF_COMPILE_BASE = "none";
    else env.SELF_COMPILE_BASE_FUEL = c.base;
    const p = await new Deno.Command("bash", {
      args: [`${ROOT}scripts/self-compile-time.sh`, "--pair", dir],
      env,
      stdout: "piped",
      stderr: "piped",
    }).output();
    const dec = new TextDecoder();
    return { code: p.code, out: dec.decode(p.stdout) + dec.decode(p.stderr) };
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
}

function expect(name: string, got: { code: number; out: string }, code: number, says: string) {
  if (got.code !== code || !got.out.includes(says)) {
    throw new Error(`${name}: want exit ${code} and "${says}", got exit ${got.code}:\n${got.out}`);
  }
}

const G = 100_000_000_000;

Deno.test("fuel grade: a batch under the tier on its base passes, whatever master's drift", async () => {
  const r = await grade({ fuel: G + G / 200, base: String(G), baseline: G - G / 20 });
  expect("drift", r, 0, "self-compile time ok");
  expect("drift is reported", r, 0, "CUMULATIVE DRIFT past +3%");
  expect("per-PR line", r, 0, "+0.50% on 100000000000 (base fuel given)");
});

Deno.test("fuel grade: a batch past the tier on its base reds", async () => {
  const r = await grade({ fuel: G + G / 50, base: String(G), baseline: G });
  expect("rise", r, 1, "SELF-COMPILE FUEL ROSE +2.00% on its base");
});

Deno.test("fuel grade: past 1.5x the ledgered baseline still reds", async () => {
  const r = await grade({ fuel: G + G / 10 * 6, base: String(G + G / 10 * 6), baseline: G });
  expect("factor", r, 1, "SELF-COMPILE COST TRIPWIRE");
});

Deno.test("fuel grade: with no base, the per-PR tier falls back to the ledgered baseline", async () => {
  expect("fallback ok", await grade({ fuel: G + G / 200, base: "none", baseline: G }), 0, "ledgered baseline (no base master to measure)");
  expect("fallback red", await grade({ fuel: G + G / 50, base: "none", baseline: G }), 1, "SELF-COMPILE FUEL ROSE");
});
