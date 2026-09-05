// THE OWNER-FACING READING: `compiler/typecheck.vl` opened in the editor.
//
// On master the extension published 213 Problems for that file — 155
// `kind-ladder-incomplete`, 44 `sentinel-index-unguarded`, 14
// `arena-scan-outside-pass` — every one of them debt the committed ratchets already
// hold at or above the file's count. This drives the REAL lint over the REAL file
// against the REAL baselines, so the number cannot be asserted from a recording.
//
// Seed-backed, and named `vl_*` so ci-native's glob runs it (see
// tests/ci_seed_coverage_test.ts).

import { loadWasmChecker } from "../lsp/src/wasmCheckerNode.ts";
import { applyRatchetHold, invalidateRatchetBaselines } from "../lsp/src/ratchetHold.ts";
import { COMPILER, ROOT, exists } from "./support/tree.ts";

const ENABLED = exists(COMPILER);
if (!ENABLED) {
  console.warn("[vl-ratchet-hold] skipped — no build/vl-compiler.wasm.");
}

const logs: string[] = [];
const TARGET = `${ROOT}/compiler/typecheck.vl`;
const HELD_CODES = [
  "kind-ladder-incomplete",
  "sentinel-index-unguarded",
  "arena-scan-outside-pass",
];

/** The file's lint findings for the ratcheted codes, before any hold. */
const rawFindings = () => {
  const checker = loadWasmChecker(COMPILER, (m) => logs.push(m))!;
  const src = Deno.readTextFileSync(TARGET);
  return { src, diags: checker.lint(src) };
};

Deno.test({
  name: "ratchet-hold: typecheck.vl's ratcheted findings all sit at or under baseline",
  ignore: !ENABLED,
  fn: () => {
    invalidateRatchetBaselines();
    const { diags } = rawFindings();
    const held = diags.filter((d) => HELD_CODES.includes(String(d.code)));
    if (held.length < 100) {
      throw new Error(
        `the premise of this test is that the file carries a large held backlog; ` +
          `got only ${held.length} findings for ${HELD_CODES.join(", ")}`,
      );
    }
    const out = applyRatchetHold(diags, TARGET, ROOT, false);
    const stillHeld = out.filter((d) => HELD_CODES.includes(String(d.code)));
    if (stillHeld.length !== 0) {
      throw new Error(
        `want 0 ratcheted findings published for typecheck.vl, got ${stillHeld.length}: ` +
          JSON.stringify(stillHeld.slice(0, 3).map((d) => d.message)),
      );
    }
  },
});

Deno.test({
  name: "ratchet-hold: showHeld brings the same backlog back as greyed hints",
  ignore: !ENABLED,
  fn: () => {
    invalidateRatchetBaselines();
    const { diags } = rawFindings();
    const held = diags.filter((d) => HELD_CODES.includes(String(d.code)));
    const out = applyRatchetHold(diags, TARGET, ROOT, true);
    const shown = out.filter((d) => HELD_CODES.includes(String(d.code)));
    if (shown.length !== held.length) {
      throw new Error(
        `showHeld: want all ${held.length} back, got ${shown.length}`,
      );
    }
    const loud = shown.filter((d) => d.severity !== "hint");
    if (loud.length !== 0) {
      throw new Error(`showHeld: ${loud.length} came back louder than a hint`);
    }
  },
});

Deno.test({
  name: "ratchet-hold: ONE added ladder makes every kind-ladder finding loud",
  ignore: !ENABLED,
  fn: async () => {
    invalidateRatchetBaselines();
    const { src, diags } = rawFindings();
    const before = diags.filter((d) => d.code === "kind-ladder-incomplete").length;

    // A two-arm ladder over a closed set with no default — the shape the rule names —
    // appended to the file's own text. It is the file's CONTENT that is graded, so
    // the buffer need never be written to disk.
    const added = src + [
      "",
      "function heldRatchetProbe(n: i32) {",
      "  const x = P.nodes[n]",
      "  if x is Ident { return 1 }",
      "  else if x is NumLit { return 2 }",
      "  0",
      "}",
      "",
    ].join("\n");
    const checker = loadWasmChecker(COMPILER, (m) => logs.push(m))!;
    const after = checker.lint(added);
    const ladders = after.filter((d) => d.code === "kind-ladder-incomplete");
    if (ladders.length !== before + 1) {
      throw new Error(
        `the probe must add exactly one ladder: ${before} -> ${ladders.length}`,
      );
    }

    const out = applyRatchetHold(after, TARGET, ROOT, false);
    const published = out.filter((d) => d.code === "kind-ladder-incomplete");
    if (published.length !== before + 1) {
      throw new Error(
        `over baseline: want all ${before + 1} published, got ${published.length}`,
      );
    }
    for (const d of published) {
      if (d.severity !== "warning") {
        throw new Error(`want severity warning, got ${d.severity}`);
      }
      if (!d.message.startsWith("+1 over baseline: ")) {
        throw new Error(`want the "+1 over baseline: " prefix, got ${d.message}`);
      }
    }
    // The file's OTHER ratcheted codes did not move, so they stay held.
    const others = out.filter((d) =>
      d.code === "sentinel-index-unguarded" || d.code === "arena-scan-outside-pass"
    );
    if (others.length !== 0) {
      throw new Error(
        `adding a ladder must not unhold the other codes, got ${others.length}`,
      );
    }
    await Promise.resolve();
  },
});
