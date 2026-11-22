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
    await Deno.writeTextFile(
      `${dir}/ledger.txt`,
      `${c.baseline}\tx\t#1\ttest baseline\n`,
    );
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

function expect(
  name: string,
  got: { code: number; out: string },
  code: number,
  says: string,
) {
  if (got.code !== code || !got.out.includes(says)) {
    throw new Error(
      `${name}: want exit ${code} and "${says}", got exit ${got.code}:\n${got.out}`,
    );
  }
}

const G = 100_000_000_000;

Deno.test("fuel grade: a batch under the tier on its base passes, whatever master's drift", async () => {
  const r = await grade({
    fuel: G + G / 200,
    base: String(G),
    baseline: G - G / 20,
  });
  expect("drift", r, 0, "self-compile time ok");
  expect("drift is reported", r, 0, "CUMULATIVE DRIFT past +3%");
  expect("per-PR line", r, 0, "+0.50% on 100000000000 (base fuel given)");
});

Deno.test("fuel grade: a batch past the tier on its base reds", async () => {
  const r = await grade({ fuel: G + G / 50, base: String(G), baseline: G });
  expect("rise", r, 1, "SELF-COMPILE FUEL ROSE +2.00% on its base");
});

Deno.test("fuel grade: past 1.5x the ledgered baseline still reds", async () => {
  const r = await grade({
    fuel: G + G / 10 * 6,
    base: String(G + G / 10 * 6),
    baseline: G,
  });
  expect("factor", r, 1, "SELF-COMPILE COST TRIPWIRE");
});

Deno.test("fuel grade: with no base, the per-PR tier falls back to the ledgered baseline", async () => {
  expect(
    "fallback ok",
    await grade({ fuel: G + G / 200, base: "none", baseline: G }),
    0,
    "ledgered baseline (no base master to measure)",
  );
  expect(
    "fallback red",
    await grade({ fuel: G + G / 50, base: "none", baseline: G }),
    1,
    "SELF-COMPILE FUEL ROSE",
  );
});

// THE BASE CACHE. A throwaway checkout (the script and the file it sources, then two commits of
// compiler/) and a stand-in host whose every build writes $FAKE_SEED and, fueled, prints
// $FAKE_FUEL, so the base's L2 is measured and cached with no real build.
const FAKE_VL = `#!/bin/sh
out=""
while [ $# -gt 0 ]; do [ "$1" = -o ] && out="$2"; shift; done
[ -n "$out" ] && printf '%s' "$FAKE_SEED" > "$out"
[ "$VL_FUEL" = 1 ] && echo "[fuel] guest: $FAKE_FUEL" >&2
exit 0
`;

async function git(cwd: string, ...args: string[]) {
  const p = await new Deno.Command("git", {
    args,
    cwd,
    stdout: "null",
    stderr: "piped",
  }).output();
  if (p.code !== 0) {
    throw new Error(
      `git ${args.join(" ")}: ${new TextDecoder().decode(p.stderr)}`,
    );
  }
}

/** A checkout whose HEAD edits compiler/ past its first commit, the base. */
async function checkout(): Promise<string> {
  const dir = await Deno.makeTempDir({ prefix: "fuel_base_" });
  await Deno.mkdir(`${dir}/scripts`);
  await Deno.mkdir(`${dir}/compiler`);
  for (const f of ["self-compile-time.sh", "self-compile-gc.sh"]) {
    await Deno.copyFile(`${ROOT}scripts/${f}`, `${dir}/scripts/${f}`);
  }
  await Deno.writeTextFile(`${dir}/deno.json`, "{}\n");
  await Deno.writeTextFile(`${dir}/compiler/entry.vl`, "print(1)\n");
  await git(dir, "init", "-q");
  await git(dir, "add", "-A");
  await git(
    dir,
    "-c",
    "user.name=t",
    "-c",
    "user.email=t@t",
    "commit",
    "-qm",
    "base",
  );
  await Deno.writeTextFile(`${dir}/compiler/entry.vl`, "print(2)\n");
  await git(
    dir,
    "-c",
    "user.name=t",
    "-c",
    "user.email=t@t",
    "commit",
    "-qam",
    "candidate",
  );
  await Deno.writeTextFile(`${dir}/vl`, FAKE_VL);
  await Deno.chmod(`${dir}/vl`, 0o755);
  return dir;
}

/** Grades a canned stage 4 of fuel `G` against the base the stand-in host measures. */
async function gradeOnBase(
  co: string,
  seed: string,
  fuel: number,
): Promise<{ code: number; out: string }> {
  const dir = await Deno.makeTempDir({ prefix: "fuel_grade_", dir: co });
  await Deno.writeTextFile(
    `${dir}/stage4.time`,
    `[fuel] guest: ${G}\n[gc] peak live after a collection: 1048576 KiB\nuser 40.0\nsys 1.0\n`,
  );
  await Deno.writeTextFile(
    `${dir}/baseline.json`,
    `{\n"fuel": ${G},\n"factor": 1.5,\n"tier": 0.01,\n"commit": "x"\n}\n`,
  );
  await Deno.writeTextFile(`${dir}/ledger.txt`, `${G}\tx\t#1\ttest baseline\n`);
  await Deno.writeTextFile(`${dir}/seed.wasm`, "candidate seed");
  const p = await new Deno.Command("bash", {
    args: [`${co}/scripts/self-compile-time.sh`, "--pair", dir],
    env: {
      VL: `${co}/vl`,
      SEED: `${dir}/seed.wasm`,
      BASELINE: `${dir}/baseline.json`,
      LEDGER: `${dir}/ledger.txt`,
      SELF_COMPILE_BASE: "HEAD~1",
      XDG_CACHE_HOME: `${co}/cache`,
      FAKE_SEED: seed,
      FAKE_FUEL: String(fuel),
    },
    stdout: "piped",
    stderr: "piped",
  }).output();
  const dec = new TextDecoder();
  return { code: p.code, out: dec.decode(p.stdout) + dec.decode(p.stderr) };
}

/** The one cached entry's stored seed. */
async function cachedSeed(co: string): Promise<string> {
  const root = `${co}/cache/vl/base-fuel-seed`;
  for await (const e of Deno.readDir(root)) {
    return `${root}/${e.name}/seed.wasm`;
  }
  throw new Error(`no cache entry under ${root}`);
}

Deno.test("fuel grade: the base's L2 is cached by its fixpoint seed and read back", async () => {
  const co = await checkout();
  try {
    expect(
      "measured",
      await gradeOnBase(co, "fix-a", G),
      0,
      `+0.00% on ${G} (base `,
    );
    // The same fixpoint reads the cached fuel, whatever a new measurement would say.
    expect(
      "cached",
      await gradeOnBase(co, "fix-a", G * 2),
      0,
      `+0.00% on ${G} (base `,
    );
  } finally {
    await Deno.remove(co, { recursive: true });
  }
});

Deno.test("fuel grade: a stale base cache entry is refused, not read", async () => {
  const co = await checkout();
  try {
    expect("measured", await gradeOnBase(co, "fix-a", G * 1.004), 0, "(base ");
    // The entry's stored seed no longer matches the fixpoint: its fuel is not trusted.
    await Deno.writeTextFile(
      await cachedSeed(co),
      "another lineage's fixpoint",
    );
    const r = await gradeOnBase(co, "fix-a", G);
    expect("refused", r, 0, "holds another seed; measured again");
    expect("measured again", r, 0, `+0.00% on ${G} (base `);
  } finally {
    await Deno.remove(co, { recursive: true });
  }
});

Deno.test("fuel grade: another fixpoint of the same tree gets its own entry", async () => {
  const co = await checkout();
  try {
    expect("first", await gradeOnBase(co, "fix-a", G * 1.004), 0, "-0.40% on ");
    expect(
      "second",
      await gradeOnBase(co, "fix-b", G),
      0,
      `+0.00% on ${G} (base `,
    );
  } finally {
    await Deno.remove(co, { recursive: true });
  }
});
