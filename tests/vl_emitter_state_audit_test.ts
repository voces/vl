// THE EMITTER-STATE AUDIT: ITS FRAME-BUILDER ANCHORS, ITS ASYMMETRIC SET AND ITS RATCHET.
//
// `scripts/emitter-state-audit.vl` asks which `fnUses*` frame flag one builder clears and
// the other does not — the shape of D1006/D1007. It reaches the start-fn side through
// `FRAME_ROOTS`, and an anchor pinned to one refactor is how the instrument went quiet:
// D1595 split the start-fn builder, the resets moved to `startFnDetectFrames`, and the
// audit went on naming the function it had left — reporting 19 asymmetries where 2 were
// real. Nothing failed, because a wrong answer from a script nobody re-derives looks like
// an answer.
//
// So this pins both halves. Every root resolves to a real `function` in the emitter, and
// the asymmetric set is exactly the two rows that are open. A root that is renamed, or a
// reset that moves out of the root's own module, reds here with the name that moved.
//
// WHEN D1006 OR D1007 CLOSES: the survivor leaves this list, and `OPEN_LEAKS` in
// tests/vl_instance_state_leak_test.ts — which measures the same two flags by compiling
// one program after another on ONE instance — loses its entry in the same PR.
//
// The third test is the ratchet's control: `--check` passes on the committed baseline and
// reds on one a single row below the count, so a detector that stopped counting cannot
// pass quietly.
//
// GATING: env-gated (`SELFHOST_NATIVE_ALIGN=1`) AND requires the built binary + seed.
//
// @test-timing native

import { COMPILER, ROOT, VL, exists, nativeEnv } from "./support/tree.ts";

const SCRIPT = `${ROOT}/scripts/emitter-state-audit.vl`;
const BASELINE = `${ROOT}/scripts/emitter-state-baseline.json`;
const EMIT_SECTIONS = `${ROOT}/compiler/emit_sections.vl`;

const GATED = Deno.env.get("SELFHOST_NATIVE_ALIGN") === "1";
const ENABLED = GATED && exists(VL) && exists(COMPILER);
if (GATED && !ENABLED) {
  console.warn("[vl-emitter-state-audit] skipped — missing vl binary or seed wasm.");
}

/** The rows whose flag is genuinely never reset on the start-fn side. */
const OPEN = new Map([
  ["fnUsesU8Push", "D1006"],
  ["fnUsesMapVals", "D1007"],
]);

const audit = async (args: string[]): Promise<{ code: number; out: string }> => {
  const { code, stdout, stderr } = await new Deno.Command(VL, {
    args: ["run", SCRIPT, "--compiler", COMPILER, "--", ...args],
    cwd: ROOT,
    stdout: "piped",
    stderr: "piped",
    env: nativeEnv({ NO_COLOR: "1" }),
  }).output();
  const dec = new TextDecoder();
  return { code, out: dec.decode(stdout) + dec.decode(stderr) };
};

/** `const FRAME_ROOTS = ["a", "b"]` from the script's own source — never a second copy here. */
const roots = (): string[] => {
  const src = Deno.readTextFileSync(SCRIPT);
  const m = src.match(/^const FRAME_ROOTS\s*=\s*\[([^\]]*)\]/m);
  if (!m) {
    throw new Error(`no FRAME_ROOTS list in ${SCRIPT} — did the audit's anchors move?`);
  }
  const names = [...m[1].matchAll(/"([A-Za-z_][A-Za-z0-9_]*)"/g)].map((x) => x[1]);
  if (names.length < 2) {
    throw new Error(`FRAME_ROOTS names ${names.length} builder(s), want the two: ${m[1]}`);
  }
  return names;
};

Deno.test("emitter-state-audit: every frame-builder anchor is a real function", () => {
  const src = Deno.readTextFileSync(EMIT_SECTIONS);
  for (const root of roots()) {
    const re = new RegExp(`^(?:export )?function ${root}\\(`, "m");
    if (!re.test(src)) {
      throw new Error(
        `FRAME_ROOTS names \`${root}\`, which compiler/emit_sections.vl no longer ` +
          `declares. The audit walks that function's callees for the frame resets, so a ` +
          `stale name silently reports every reset as missing (D1595 did exactly that). ` +
          `Re-point FRAME_ROOTS at the builder that owns the resets now.`,
      );
    }
  }
});

Deno.test({
  name: "emitter-state-audit: the asymmetric flags are exactly the open rows",
  ignore: !ENABLED,
  fn: async () => {
    const { code, out } = await audit([]);
    if (code !== 0) throw new Error(`emitter-state-audit.vl exited ${code}:\n${out}`);
    const line = out.split("\n").find((l) => / of \d+ asymmetric: /.test(l));
    if (!line) {
      throw new Error(`no "N of M asymmetric" summary line in:\n${out}`);
    }
    const listed = line.slice(line.indexOf(": ") + 2).trim();
    const got = listed === "none" ? [] : listed.split(", ").map((s) => s.trim());
    const want = [...OPEN.keys()].sort();
    if ([...got].sort().join(",") !== want.join(",")) {
      const rows = [...OPEN].map(([f, r]) => `${f} (${r})`).join(", ");
      throw new Error(
        `frame-flag asymmetries: want exactly the open rows ${rows}, got [${got.join(", ")}].\n` +
          `A NEW name means a flag one builder clears and the other does not — file it, ` +
          `it leaks into the next program's start function. A MISSING name means either the ` +
          `row closed (drop it here and from OPEN_LEAKS in ` +
          `tests/vl_instance_state_leak_test.ts) or the audit stopped seeing the side that ` +
          `resets it.\n${out}`,
      );
    }
  },
});

Deno.test({
  name: "emitter-state-audit: --check holds the committed baseline and reds one below it",
  ignore: !ENABLED,
  fn: async () => {
    const held = await audit(["--check"]);
    if (held.code !== 0) {
      throw new Error(`--check on the committed baseline: want exit 0, got ${held.code}\n${held.out}`);
    }
    const m = held.out.match(/never-cleared emitter state (\d+) of \d+ mutables/);
    if (!m) throw new Error(`no never-cleared summary line in:\n${held.out}`);
    const now = Number(m[1]);
    const committed = JSON.parse(Deno.readTextFileSync(BASELINE)).never;
    if (now > committed) {
      throw new Error(`never-cleared ${now} is above the committed baseline ${committed}`);
    }
    const dir = Deno.makeTempDirSync({ prefix: "vl-esa-" });
    try {
      const low = `${dir}/baseline.json`;
      Deno.writeTextFileSync(low, JSON.stringify({ never: now - 1, commit: "control" }) + "\n");
      const red = await audit(["--check", "--baseline", low]);
      if (red.code !== 1 || !red.out.includes("emitter state budget EXCEEDED")) {
        throw new Error(
          `--check against a baseline of ${now - 1}: want exit 1 and EXCEEDED, got ${red.code}\n${red.out}`,
        );
      }
    } finally {
      Deno.removeSync(dir, { recursive: true });
    }
  },
});
