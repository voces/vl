// THE SEED-SIZE RATCHET'S THRESHOLD, GRADED AT THE BOUNDARY.
//
// `scripts/seed-size.py --check` is the only thing standing between an emitter
// change and an unnoticed jump in the compiler's own bytes, and its whole content
// is one comparison. A bar that is off by one in either direction fails silently:
// too loose it never reds, too tight it reds on every landing and gets removed.
//
// So this runs the script on a FAKE baseline/size pair — no seed, no vl binary,
// milliseconds — and pins the boundary from both sides: exactly at the bar passes,
// one byte past it fails. It also pins the two non-obvious behaviours the gate
// depends on: shrinkage passes (it is not a size TARGET), and an absent seed exits
// 0 with a line saying so, because the `ci` job never builds one.

import { ROOT } from "./support/tree.ts";

const SCRIPT = `${ROOT}/scripts/seed-size.py`;
const CI_YML = `${ROOT}/.github/workflows/ci.yml`;
const GATE_SH = `${ROOT}/scripts/gate.sh`;

// Mirrors seed-size.py's own constant and its integer limit. Duplicated ON PURPOSE:
// reading it out of the script would make the test agree with any value the script
// happens to hold, which is not a test of the bar.
const MAX_GROWTH_PCT = 3.0;
const BASE = 1_000_000;
const LIMIT = BASE + Math.trunc((BASE * MAX_GROWTH_PCT) / 100); // 1_030_000

const dec = new TextDecoder();

const run = async (args: string[]): Promise<{ code: number; out: string }> => {
  const { code, stdout, stderr } = await new Deno.Command("python3", {
    args: [SCRIPT, ...args],
    stdout: "piped",
    stderr: "piped",
  }).output();
  return { code, out: dec.decode(stdout) + dec.decode(stderr) };
};

type Case = { name: string; size: number | null; wantCode: number; says: string };

const CASES: Case[] = [
  { name: "shrunk", size: BASE - 100_000, wantCode: 0, says: "-10.0%" },
  { name: "unchanged", size: BASE, wantCode: 0, says: "+0.0%" },
  { name: "growth under the bar", size: LIMIT - 1, wantCode: 0, says: "baseline 1000000" },
  { name: "growth exactly at the bar", size: LIMIT, wantCode: 0, says: "+3.0%" },
  { name: "one byte past the bar", size: LIMIT + 1, wantCode: 1, says: "REGRESSED" },
  { name: "well past the bar", size: BASE + 100_000, wantCode: 1, says: "REGRESSED" },
  { name: "no seed at all", size: null, wantCode: 0, says: "no seed at" },
];

Deno.test("seed-size: the +3% bar is graded at the boundary, in both directions", async () => {
  const dir = await Deno.makeTempDir({ prefix: "vl_seed_size_" });
  const baseline = `${dir}/baseline.json`;
  await Deno.writeTextFile(baseline, `{"bytes": ${BASE}, "commit": "0000000"}\n`);

  for (const c of CASES) {
    const seed = `${dir}/${c.size === null ? "absent" : c.size}.wasm`;
    if (c.size !== null) await Deno.writeFile(seed, new Uint8Array(c.size));

    const { code, out } = await run(["--check", "--seed", seed, "--baseline", baseline]);

    if (code !== c.wantCode) {
      throw new Error(
        `seed-size --check on "${c.name}" (size ${c.size}, baseline ${BASE}, ` +
          `bar ${LIMIT}): want exit ${c.wantCode}, got ${code}. Output:\n${out}`,
      );
    }
    if (!out.includes(c.says)) {
      throw new Error(
        `seed-size --check on "${c.name}": want the output to contain ` +
          `${JSON.stringify(c.says)}, got:\n${out}`,
      );
    }
  }
});

// --write-baseline is the other half of a ratchet: without it a legitimate growth
// has no way to land, and the gate becomes a thing people comment out.
Deno.test("seed-size: --write-baseline records the size, and --check then passes", async () => {
  const dir = await Deno.makeTempDir({ prefix: "vl_seed_size_write_" });
  const baseline = `${dir}/baseline.json`;
  const seed = `${dir}/seed.wasm`;
  const size = 4321;
  await Deno.writeFile(seed, new Uint8Array(size));

  const written = await run(["--write-baseline", "--seed", seed, "--baseline", baseline]);
  if (written.code !== 0) {
    throw new Error(`--write-baseline exited ${written.code}, want 0:\n${written.out}`);
  }

  const row = JSON.parse(await Deno.readTextFile(baseline)) as {
    bytes: number;
    commit: string;
  };
  if (row.bytes !== size) {
    throw new Error(`baseline records bytes ${row.bytes}, want ${size}`);
  }
  if (typeof row.commit !== "string" || row.commit.length === 0) {
    throw new Error(
      `baseline records no commit (${JSON.stringify(row.commit)}) — the field is the ` +
        `provenance a human reads when a jump has to be attributed`,
    );
  }

  const after = await run(["--check", "--seed", seed, "--baseline", baseline]);
  if (after.code !== 0) {
    throw new Error(`--check after --write-baseline exited ${after.code}:\n${after.out}`);
  }
});

// The committed baseline is what CI compares against, so a malformed one turns the
// gate into a crash rather than a verdict. One line, the two fields, nothing else.
Deno.test("seed-size: the committed baseline is one line with bytes + commit", async () => {
  const text = await Deno.readTextFile(`${ROOT}/scripts/seed-size-baseline.json`);
  if (text.trimEnd().includes("\n")) {
    throw new Error(
      `scripts/seed-size-baseline.json must be ONE line (it is rewritten by any PR ` +
        `that grows the seed, and a multi-line JSON is what makes such a file merge ` +
        `wrongly in silence). Got:\n${text}`,
    );
  }
  const row = JSON.parse(text) as { bytes: number; commit: string };
  if (!Number.isInteger(row.bytes) || row.bytes <= 0) {
    throw new Error(`baseline "bytes" is ${JSON.stringify(row.bytes)}, want a positive integer`);
  }
  if (typeof row.commit !== "string" || row.commit.length === 0) {
    throw new Error(`baseline "commit" is ${JSON.stringify(row.commit)}, want a commit id`);
  }
});

// A ratchet nobody runs is the thing this gate was built to prevent, one level up:
// the seed's size was already knowable, and went unmeasured for four landings. So
// pin that BOTH runners still invoke it.
Deno.test("seed-size: gate.sh and ci-native both run the ratchet", async () => {
  for (const [path, file] of [[GATE_SH, "scripts/gate.sh"], [CI_YML, ".github/workflows/ci.yml"]]) {
    const src = await Deno.readTextFile(path);
    if (!src.includes("scripts/seed-size.py --check")) {
      throw new Error(
        `${file} no longer runs \`scripts/seed-size.py --check\`. The seed-size ratchet ` +
          `only measures what a runner asks it to — dropping it from either is how the ` +
          `number goes stale again. If the gate was moved on purpose, update this test.`,
      );
    }
  }
});
