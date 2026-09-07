// THE SEED-SIZE RATCHET'S THRESHOLD, GRADED AT THE BOUNDARY — and the record of the
// port that made the ratchet a VL program.
//
// `scripts/seed-size.vl --check` is the only thing standing between an emitter change
// and an unnoticed jump in the compiler's own bytes, and its whole content is one
// comparison. A bar that is off by one in either direction fails silently: too loose it
// never reds, too tight it reds on every landing and gets removed. So the first case
// below runs the script on a FAKE baseline/size pair and pins the boundary from both
// sides — exactly at the bar passes, one byte past it fails — plus the two non-obvious
// behaviours the gate depends on: shrinkage passes (it is not a size TARGET), and an
// absent seed exits 0 with a line saying so, because the `ci` job never builds one.
//
// WHY THIS SUITE NOW NEEDS THE BINARY AND A SEED. The ratchet was `scripts/seed-size.py`
// until this landed; a `stat` and a `json.load` needed neither. It is VL now — the first
// orchestrator script the language runs on itself — so it is compiled by the very seed it
// measures, and this suite is gated like every other seed-backed one.
//
// THE PORT WAS GRADED BY RUNNING BOTH, output for output, before the Python was deleted:
// stdout, stderr and exit code were byte-identical on the bare report, `--check` under
// the bar, `--check` and the bare report with an absent seed, a five-figure percentage
// (`+231831.7%`), and `--write-baseline` — whose written file was byte-identical too,
// `{"bytes": 2319317, "commit": "097eda389"}`. Three places they could NOT agree, all
// three pinned below as the port's own behaviour rather than left as prose:
//
//   1. THE ROUNDING TIE. `std:fmt` renders a float only at full precision
//      (`open-rulings.md` §D `fmt-fixed-precision`), so the port computes the percentage
//      in integer TENTHS and rounds half away from zero on the exact ratio, where the
//      Python rounded the nearest DOUBLE half to even. At 2003 bytes against a 2000-byte
//      baseline the true ratio is 0.15, whose nearest double is 0.1499999999999999944 —
//      the Python printed `+0.1%`, the port prints `+0.2%`. One byte, the tenths digit.
//      Its neighbour at 0.05% agrees, which is what makes this a TIE and not a general
//      disagreement.
//   2. THE TOOL THE REGRESSED MESSAGE NAMES. The port says
//      `vl run scripts/seed-size.vl --write-baseline` where the Python said
//      `python3 scripts/seed-size.py --write-baseline`. Deliberate: a message naming the
//      script it replaced would be wrong the day that script is deleted, which is today.
//   3. THE STREAM A LOUD FAILURE USES. The Python raised `SystemExit`, which reaches
//      STDERR; VL has no stderr sink, so the port prints to stdout. Both exit 1, and the
//      verdict — which is what a runner reads — is unchanged.
//
// @test-timing native

import { COMPILER, ROOT, VL, exists, nativeEnv } from "./support/tree.ts";

const CI_YML = `${ROOT}/.github/workflows/ci.yml`;
const GATE_SH = `${ROOT}/scripts/gate.sh`;

const GATED = Deno.env.get("SELFHOST_NATIVE_ALIGN") === "1";
const ENABLED = GATED && exists(VL) && exists(COMPILER);
if (GATED && !ENABLED) {
  console.warn("[vl-seed-size] skipped — missing vl binary or seed wasm.");
}

// Mirrors seed-size.vl's own constant and its integer limit. Duplicated ON PURPOSE:
// reading it out of the script would make the test agree with any value the script
// happens to hold, which is not a test of the bar.
const MAX_GROWTH_PCT = 3.0;
const BASE = 1_000_000;
const LIMIT = BASE + Math.trunc((BASE * MAX_GROWTH_PCT) / 100); // 1_030_000

const dec = new TextDecoder();

/**
 * `scripts/seed-size.vl <argv>`, run from the checkout root — which is not decoration:
 * the script resolves every path against the working directory, because a VL program can
 * read neither its own path nor the cwd (`open-rulings.md` §D `script-self-location`).
 */
const run = async (
  argv: string[],
): Promise<{ code: number; out: string; err: string }> => {
  const { code, stdout, stderr } = await new Deno.Command(VL, {
    args: [
      "run",
      "scripts/seed-size.vl",
      "--compiler",
      COMPILER,
      "--",
      ...argv,
    ],
    cwd: ROOT,
    stdout: "piped",
    stderr: "piped",
    env: nativeEnv({ NO_COLOR: "1" }),
  }).output();
  return { code, out: dec.decode(stdout), err: dec.decode(stderr) };
};

type Case = { name: string; size: number | null; wantCode: number; says: string };

const CASES: Case[] = [
  { name: "shrunk", size: BASE - 100_000, wantCode: 0, says: "-10.0%" },
  { name: "unchanged", size: BASE, wantCode: 0, says: "+0.0%" },
  {
    name: "growth under the bar",
    size: LIMIT - 1,
    wantCode: 0,
    says: "baseline 1000000",
  },
  { name: "growth exactly at the bar", size: LIMIT, wantCode: 0, says: "+3.0%" },
  { name: "one byte past the bar", size: LIMIT + 1, wantCode: 1, says: "REGRESSED" },
  { name: "well past the bar", size: BASE + 100_000, wantCode: 1, says: "REGRESSED" },
  { name: "no seed at all", size: null, wantCode: 0, says: "no seed at" },
];

Deno.test({
  name: "seed-size: the +3% bar is graded at the boundary, in both directions",
  ignore: !ENABLED,
  fn: async () => {
    const dir = await Deno.makeTempDir({ prefix: "vl_seed_size_" });
    try {
      const baseline = `${dir}/baseline.json`;
      await Deno.writeTextFile(
        baseline,
        `{"bytes": ${BASE}, "commit": "0000000"}\n`,
      );

      for (const c of CASES) {
        const seed = `${dir}/${c.size === null ? "absent" : c.size}.wasm`;
        if (c.size !== null) await Deno.writeFile(seed, new Uint8Array(c.size));

        const { code, out, err } = await run([
          "--check",
          "--seed",
          seed,
          "--baseline",
          baseline,
        ]);

        if (code !== c.wantCode) {
          throw new Error(
            `seed-size --check on "${c.name}" (size ${c.size}, baseline ${BASE}, ` +
              `bar ${LIMIT}): want exit ${c.wantCode}, got ${code}. Output:\n${out}${err}`,
          );
        }
        if (!out.includes(c.says)) {
          throw new Error(
            `seed-size --check on "${c.name}": want the output to contain ` +
              `${JSON.stringify(c.says)}, got:\n${out}${err}`,
          );
        }
      }
    } finally {
      await Deno.remove(dir, { recursive: true });
    }
  },
});

// --write-baseline is the other half of a ratchet: without it a legitimate growth has no
// way to land, and the gate becomes a thing people comment out. The SHAPE of what it
// writes is part of the contract — one line, `bytes` before `commit`, a trailing newline
// — because the file is rewritten by any PR that grows the seed, and a multi-line JSON is
// what makes such a file merge wrongly in silence.
Deno.test({
  name: "seed-size: --write-baseline records the size, and --check then passes",
  ignore: !ENABLED,
  fn: async () => {
    const dir = await Deno.makeTempDir({ prefix: "vl_seed_size_write_" });
    try {
      const baseline = `${dir}/baseline.json`;
      const seed = `${dir}/seed.wasm`;
      const size = 4321;
      await Deno.writeFile(seed, new Uint8Array(size));

      const written = await run([
        "--write-baseline",
        "--seed",
        seed,
        "--baseline",
        baseline,
      ]);
      if (written.code !== 0) {
        throw new Error(
          `--write-baseline exited ${written.code}, want 0:\n${written.out}${written.err}`,
        );
      }

      const text = await Deno.readTextFile(baseline);
      if (!/^\{"bytes": \d+, "commit": "[^"]+"\}\n$/.test(text)) {
        throw new Error(`--write-baseline wrote an unexpected shape: ${text}`);
      }
      const row = JSON.parse(text) as { bytes: number; commit: string };
      if (row.bytes !== size) {
        throw new Error(`baseline records bytes ${row.bytes}, want ${size}`);
      }
      if (typeof row.commit !== "string" || row.commit.length === 0) {
        throw new Error(
          `baseline records no commit (${JSON.stringify(row.commit)}) — the field is the ` +
            `provenance a human reads when a jump has to be attributed`,
        );
      }

      const after = await run([
        "--check",
        "--seed",
        seed,
        "--baseline",
        baseline,
      ]);
      if (after.code !== 0) {
        throw new Error(
          `--check after --write-baseline exited ${after.code}:\n${after.out}${after.err}`,
        );
      }
    } finally {
      await Deno.remove(dir, { recursive: true });
    }
  },
});

// The committed baseline is what CI compares against, so a malformed one turns the gate
// into a crash rather than a verdict. One line, the two fields, nothing else.
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

// A ratchet nobody runs is the thing this gate was built to prevent, one level up: the
// seed's size was already knowable, and went unmeasured for four landings. So pin that
// BOTH runners still invoke it — and, since the ratchet is VL now, that neither has been
// left pointing at the Python this PR deleted.
Deno.test("seed-size: gate.sh and ci-native both run the VL ratchet", async () => {
  for (
    const [path, file] of [
      [GATE_SH, "scripts/gate.sh"],
      [CI_YML, ".github/workflows/ci.yml"],
    ]
  ) {
    const src = await Deno.readTextFile(path);
    if (!src.includes("scripts/seed-size.vl") || !src.includes("--check")) {
      throw new Error(
        `${file} no longer runs \`scripts/seed-size.vl … --check\`. The seed-size ratchet ` +
          `only measures what a runner asks it to — dropping it from either is how the ` +
          `number goes stale again. If the gate was moved on purpose, update this test.`,
      );
    }
    if (src.includes("scripts/seed-size.py")) {
      throw new Error(
        `${file} still names scripts/seed-size.py, which no longer exists.`,
      );
    }
  }
});

// DIVERGENCE 1 from the Python, asserted rather than described: the rounding tie, and
// only the tenths digit. The neighbour that does NOT tie is the control — without it
// this pins a number rather than a rule.
Deno.test({
  name: "seed-size: the one-decimal percentage rounds half away from zero on the exact ratio",
  ignore: !ENABLED,
  fn: async () => {
    const dir = await Deno.makeTempDir({ prefix: "vl_seed_size_tie_" });
    try {
      const baseline = `${dir}/tie.json`;
      await Deno.writeTextFile(baseline, `{"bytes": 2000, "commit": "aaa"}\n`);
      // 2003/2000 is exactly +0.15%; 2001/2000 is exactly +0.05%.
      await Deno.writeFile(`${dir}/tie.wasm`, new Uint8Array(2003));
      await Deno.writeFile(`${dir}/near.wasm`, new Uint8Array(2001));

      const tie = await run(["--seed", `${dir}/tie.wasm`, "--baseline", baseline]);
      if (tie.out !== "seed size 2003 bytes, baseline 2000 (+0.2%)\n") {
        throw new Error(`the tie: got ${JSON.stringify(tie.out)}`);
      }
      const near = await run(["--seed", `${dir}/near.wasm`, "--baseline", baseline]);
      if (near.out !== "seed size 2001 bytes, baseline 2000 (+0.1%)\n") {
        throw new Error(`the 0.05 neighbour: got ${JSON.stringify(near.out)}`);
      }
      // The Python printed `+0.1%` for the tie — its double is 0.1499999999999999944 and
      // it rounds half to EVEN — and `+0.1%` for the neighbour, agreeing there.
    } finally {
      await Deno.remove(dir, { recursive: true });
    }
  },
});

// DIVERGENCE 2 and 3, in one program: over the bar the message names THIS tool, and a
// loud baseline failure is stdout with exit 1 rather than stderr.
Deno.test({
  name: "seed-size: the regressed message names this tool, and a loud failure is stdout",
  ignore: !ENABLED,
  fn: async () => {
    const dir = await Deno.makeTempDir({ prefix: "vl_seed_size_msg_" });
    try {
      const tiny = `${dir}/tiny.json`;
      await Deno.writeTextFile(tiny, `{"bytes": 1000, "commit": "aaa"}\n`);
      await Deno.writeFile(`${dir}/big.wasm`, new Uint8Array(4000));

      const over = await run(["--seed", `${dir}/big.wasm`, "--baseline", tiny, "--check"]);
      if (over.code !== 1) {
        throw new Error(`over the bar must exit 1, got ${over.code}`);
      }
      if (!over.out.includes("  vl run scripts/seed-size.vl --write-baseline)")) {
        throw new Error(
          `the regressed message must name this tool, got:\n${over.out}`,
        );
      }
      if (over.out.includes("seed-size.py")) {
        throw new Error(`the regressed message still names the deleted Python`);
      }

      // A baseline that is not JSON: exit 1, said on STDOUT, naming the file. The Python
      // said the same thing on stderr through `SystemExit`; VL has no stderr sink.
      const bad = `${dir}/bad.json`;
      await Deno.writeTextFile(bad, "not json at all\n");
      const loud = await run(["--seed", `${dir}/big.wasm`, "--baseline", bad, "--check"]);
      if (loud.code !== 1) {
        throw new Error(`an unparseable baseline must exit 1, got ${loud.code}`);
      }
      if (loud.err !== "" || !loud.out.includes(bad)) {
        throw new Error(
          `want the reason on stdout naming ${bad}; stdout=${JSON.stringify(loud.out)} ` +
            `stderr=${JSON.stringify(loud.err)}`,
        );
      }
    } finally {
      await Deno.remove(dir, { recursive: true });
    }
  },
});
