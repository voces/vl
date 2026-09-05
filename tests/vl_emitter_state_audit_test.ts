// THE FRAME-BUILDER ANCHORS MUST STILL NAME FUNCTIONS THAT EXIST.
//
// `scripts/emitter-state-audit.py` asks which `fnUses*` frame flag one builder clears and
// the other does not — the shape of D1006/D1007. It reaches the start-fn side through
// `FRAME_ROOTS`, and an anchor pinned to one refactor is how the instrument went quiet:
// D1595 split the start-fn builder, the resets moved to `startFnDetectFrames`, and the
// script went on naming the function it had left — reporting 19 asymmetries where 2 were
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
// GATING: none. The script reads `compiler/*.vl` as text; no seed, no binary.
//
// @test-timing native

import { ROOT } from "./support/tree.ts";

const SCRIPT = `${ROOT}/scripts/emitter-state-audit.py`;
const EMIT_SECTIONS = `${ROOT}/compiler/emit_sections.vl`;

/** The rows whose flag is genuinely never reset on the start-fn side. */
const OPEN = new Map([
  ["fnUsesU8Push", "D1006"],
  ["fnUsesMapVals", "D1007"],
]);

const audit = async (): Promise<string> => {
  const { code, stdout, stderr } = await new Deno.Command("python3", {
    args: [SCRIPT],
    cwd: ROOT,
    stdout: "piped",
    stderr: "piped",
  }).output();
  const out = new TextDecoder().decode(stdout);
  const err = new TextDecoder().decode(stderr);
  if (code !== 0) {
    throw new Error(`emitter-state-audit.py exited ${code}:\n${err}\n${out}`);
  }
  return out;
};

/** `FRAME_ROOTS = ("a", "b")` from the script's own source — never a second copy here. */
const roots = (): string[] => {
  const src = Deno.readTextFileSync(SCRIPT);
  const m = src.match(/^FRAME_ROOTS\s*=\s*\(([^)]*)\)/m);
  if (!m) {
    throw new Error(`no FRAME_ROOTS tuple in ${SCRIPT} — did the audit's anchors move?`);
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

Deno.test("emitter-state-audit: the asymmetric flags are exactly the open rows", async () => {
  const out = await audit();
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
});
