// A test whose child died by a signal is a harness error, never a pass. The fixture holds
// expect-failure cases whose child is SIGKILLed (directly, and through a shell as exit 137):
// without tests/support/signal_guard.ts they pass, which is the hole; with it they fail as
// harness errors while a plain expected failure still passes. Every `deno test` the gate, CI
// and `deno task test` run must preload the guard.

const ROOT = new URL("../", import.meta.url).pathname;
const GUARD = "tests/support/signal_guard.ts";
const FIXTURE = "tests/fixtures/signal-guard/expect_failure.ts";
const dec = new TextDecoder();

async function fixture(preload: boolean) {
  const args = ["test", "-A", "--no-check", ...(preload ? ["--preload", GUARD] : []), FIXTURE];
  const r = await new Deno.Command(Deno.execPath(), {
    args,
    cwd: ROOT,
    env: { NO_COLOR: "1" },
    stdout: "piped",
    stderr: "piped",
  }).output();
  return { code: r.code, text: dec.decode(r.stdout) + dec.decode(r.stderr) };
}

Deno.test("signal guard: without it, a SIGKILLed expect-failure case passes (the hole, control)", async () => {
  const r = await fixture(false);
  if (r.code !== 0 || !r.text.includes("3 passed")) {
    throw new Error(`want the unguarded fixture to pass all 3, got exit ${r.code}:\n${r.text}`);
  }
});

Deno.test("signal guard: with it, a SIGKILLed expect-failure case is a harness error", async () => {
  const r = await fixture(true);
  const killed = (r.text.match(/harness error: `bash -c kill -9 \$\$` was killed by SIGKILL/g) ?? []).length;
  const shell = (r.text.match(/harness error: `[^`]*` exited 137/g) ?? []).length;
  if (r.code === 0 || killed < 1 || shell < 1 || !/1 passed \| 2 failed/.test(r.text)) {
    throw new Error(`want 2 harness errors and the plain failure passing, got exit ${r.code}:\n${r.text}`);
  }
});

Deno.test("signal guard: every deno test the gate, CI and deno task test run preloads it", async () => {
  const bad: string[] = [];
  for (const f of ["deno.json", "scripts/gate.sh", ".github/workflows/ci.yml", ".github/workflows/publish-seed.yml"]) {
    const lines = (await Deno.readTextFile(`${ROOT}${f}`)).split("\n");
    lines.forEach((l, i) => {
      if (/^\s*#/.test(l) || !/(^|[\s"'])deno test\b/.test(l)) return;
      if (!l.includes(`deno test --preload ${GUARD}`)) bad.push(`${f}:${i + 1}: ${l.trim()}`);
    });
  }
  if (bad.length > 0) throw new Error(`want --preload ${GUARD} on every deno test, got:\n${bad.join("\n")}`);
});

Deno.test("oom watch: oom_kills sums vmstat and the cgroup's count, and is empty with neither", async () => {
  const dir = await Deno.makeTempDir({ prefix: "oom_kills_" });
  try {
    await Deno.writeTextFile(`${dir}/vmstat`, "pgfault 9\noom_kill 3\n");
    await Deno.writeTextFile(`${dir}/events`, "low 0\noom 2\noom_kill 2\n");
    const read = async (vmstat: string, events: string) => {
      const r = await new Deno.Command("bash", {
        args: ["-c", `. ${ROOT}scripts/lib/oom-kills.sh; oom_kills`],
        env: { OOM_VMSTAT: vmstat, OOM_CGROUP_EVENTS: events },
        stdout: "piped",
      }).output();
      return dec.decode(r.stdout).trim();
    };
    const got = [
      await read(`${dir}/vmstat`, `${dir}/events`),
      await read(`${dir}/vmstat`, `${dir}/none`),
      await read(`${dir}/none`, `${dir}/none`),
    ];
    if (got.join("|") !== "5|3|") throw new Error(`want 5|3|, got ${got.join("|")}`);
    const gate = await Deno.readTextFile(`${ROOT}scripts/gate.sh`);
    if (!gate.includes("OOM0=$(oom_kills)") || !gate.includes('[ "$OOM1" -gt "$OOM0" ]')) {
      throw new Error("want gate.sh to read oom_kills at the start and fail on a rise at the end");
    }
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
});
