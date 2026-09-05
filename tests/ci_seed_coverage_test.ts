// CI coverage guard for SEED-BACKED tests.
//
// A test that loads the compiled seed (`build/vl-compiler.wasm`) self-ignores
// when the seed is absent — the convention that lets the whole suite run on a
// fresh clone. The `ci` job runs `deno task test` but never builds a seed, so
// every such test SKIPS there; only the `ci-native` job builds a seed. Therefore
// a seed-backed test runs in CI iff `ci-native` runs it — either by the
// auto-discovered globs (`selfhost_native_*_test.ts` / `vl_*_test.ts`) or by
// being named explicitly in a `ci-native` step.
//
// Nothing structural ties the two together, so a seed-backed test whose name
// matches no glob and appears in no step executes NOWHERE in CI and silently
// rots (it passes `deno task test` by self-ignoring). This guard closes that
// hole: it fails — in the `ci` job, no seed needed (a pure file scan) — the
// moment such a test exists. Wire a new seed-backed test into `ci-native`
// (preferably via the `vl_*`/`selfhost_native_*` naming) and this goes green.

import { ROOT } from "./support/tree.ts";

const TESTS_DIR = `${ROOT}/tests`;
const CI_YML = `${ROOT}/.github/workflows/ci.yml`;

// This guard mentions the seed path + scan markers as needles, so exclude it
// from its own scan.
const SELF = "ci_seed_coverage_test.ts";

// The module that DEFINES the seed path for the whole suite. It is not itself
// seed-backed — naming a path is not reading it — and it is excluded below for
// the same reason this file excludes itself. The assertion in the test keeps the
// exclusion honest: if the definition ever moves, this stops pointing at it.
const TREE = "tree.ts";

// A file NAMES the seed by the literal path or by `COMPILER`, the constant
// tests/support/tree.ts derives it as. Before that constant existed every spawner
// spelled the path itself; a rule reading only the literal now sees almost none
// of them, which is a detector going quiet rather than a tree getting cleaner.
const namesSeed = (src: string): boolean =>
  src.includes("vl-compiler.wasm") || /\bCOMPILER\b/.test(src);

// A file is seed-backed if it NAMES the seed AND gates on its presence (the
// `statSync`/`exists(` self-ignore). Both must hold so a passing mention (e.g. a
// comment) doesn't count.
const isSeedBacked = (src: string): boolean =>
  namesSeed(src) && (src.includes("statSync") || src.includes("exists("));

// A test whose driver lives in `tests/support/` INHERITS its seed-backing. The
// corpus-oracle shards are three lines each (`registerCorpusOracle(k, n)`) and
// mention neither the seed nor a stat, so on the source test alone every one of
// them would read as pure — and a shard that runs nowhere in CI is exactly the
// hole this guard exists to close.
//
// It has to be the IMPORT SPECIFIER and not a mention: `module_gate_agreement_test.ts`
// names `tests/support/casesWasmOracle.ts` as a string it READS, and a `.includes`
// rule called that pure test seed-backed and failed the guard.
const seedBackedSupport = (): RegExp[] => {
  const out: RegExp[] = [];
  for (const entry of Deno.readDirSync(`${TESTS_DIR}/support`)) {
    if (!entry.isFile || !entry.name.endsWith(".ts")) continue;
    if (entry.name === TREE) continue;
    const src = Deno.readTextFileSync(`${TESTS_DIR}/support/${entry.name}`);
    if (!isSeedBacked(src)) continue;
    const spec = entry.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    out.push(new RegExp(`from\\s+"[^"]*support/${spec}"`));
  }
  return out;
};

// The two auto-discovery globs `ci-native` runs (see ci.yml's native-suites step).
const coveredByGlob = (name: string): boolean =>
  /^selfhost_native_.*_test\.ts$/.test(name) || /^vl_.*_test\.ts$/.test(name);

Deno.test("ci-seed-coverage: every seed-backed test runs in ci-native (glob or explicit)", () => {
  const ci = Deno.readTextFileSync(CI_YML);

  const support = seedBackedSupport();
  const seedBacked: string[] = [];
  for (const entry of Deno.readDirSync(TESTS_DIR)) {
    if (!entry.isFile || !entry.name.endsWith("_test.ts")) continue;
    if (entry.name === SELF) continue;
    const src = Deno.readTextFileSync(`${TESTS_DIR}/${entry.name}`);
    const viaSupport = support.some((re) => re.test(src));
    if (isSeedBacked(src) || viaSupport) seedBacked.push(entry.name);
  }

  if (seedBacked.length === 0) {
    throw new Error(
      "found no seed-backed tests — the detection heuristic likely broke; " +
        "verify it still matches the seed self-ignore convention",
    );
  }
  if (support.length === 0) {
    throw new Error(
      "found no seed-backed module under tests/support/ — the inheritance rule " +
        "above matches nothing, so a shard whose driver lives there would read " +
        "as pure. Verify the detection still matches the self-ignore convention.",
    );
  }
  if (!Deno.readTextFileSync(`${TESTS_DIR}/support/${TREE}`).includes("vl-compiler.wasm")) {
    throw new Error(
      `tests/support/${TREE} no longer defines the seed path, so excluding it ` +
        `from the support scan excludes nothing. Point TREE at whichever module ` +
        `defines it now, or drop the exclusion.`,
    );
  }

  const uncovered = seedBacked.filter(
    (name) => !coveredByGlob(name) && !ci.includes(name),
  );

  if (uncovered.length > 0) {
    throw new Error(
      `these seed-backed tests run NOWHERE in CI (they self-ignore in the \`ci\` ` +
        `job for want of a seed, and ci-native runs neither glob nor an explicit ` +
        `mention of them):\n  ${uncovered.join("\n  ")}\n\n` +
        `Wire each into the ci-native job (.github/workflows/ci.yml) — give it a ` +
        `\`vl_*\`/\`selfhost_native_*\` name to be auto-discovered, or add it to a ` +
        `seed-backed step explicitly.`,
    );
  }
});

// The other half of the contract: `scripts/gate.sh` runs ci.yml's explicit lsp
// list too (its "lsp suites (ci list)" gate), and it does so by EXTRACTING the
// list from ci.yml at run time — anchored on the step's name. That makes list
// drift impossible, but leaves one seam: rename the step in ci.yml and the
// extraction goes empty. gate.sh fails loudly when that happens, but only for
// whoever next runs it locally; this test makes CI itself notice, by mirroring
// the extraction and requiring it to produce real files. (Measured gap,
// 2026-09-01: nine local gates green while master's ci-native was red on
// exactly these files — #2104×#2105.)
const GATE_STEP_NAME = "Editor features on the wasm compiler";

Deno.test("ci-seed-coverage: gate.sh's lsp-suite extraction still resolves against ci.yml", () => {
  const gate = Deno.readTextFileSync(`${ROOT}/scripts/gate.sh`);
  if (!gate.includes(GATE_STEP_NAME)) {
    throw new Error(
      `scripts/gate.sh no longer anchors on the ci.yml step name ` +
        `"${GATE_STEP_NAME}" — its "lsp suites (ci list)" gate extracts the ` +
        `explicit lsp test list from that step. If the gate was renamed or ` +
        `removed on purpose, update this test in the same change.`,
    );
  }

  // Mirror gate.sh's awk: lines after the step-name line, up to the next
  // `- name:`, then every tests/*.ts path in that block.
  const lines = Deno.readTextFileSync(CI_YML).split("\n");
  const start = lines.findIndex((l) => l.includes(GATE_STEP_NAME));
  if (start < 0) {
    throw new Error(
      `.github/workflows/ci.yml has no step named "${GATE_STEP_NAME}", but ` +
        `scripts/gate.sh's "lsp suites (ci list)" gate extracts its test list ` +
        `by that name — the extraction would come up empty and the gate would ` +
        `fail for whoever next runs it. Rename the anchor in BOTH files.`,
    );
  }
  const block: string[] = [];
  for (let i = start + 1; i < lines.length; i++) {
    if (lines[i].includes("- name:")) break;
    block.push(lines[i]);
  }
  const files = [
    ...new Set(block.join("\n").match(/tests\/[A-Za-z0-9_]+\.ts/g) ?? []),
  ];
  if (files.length === 0) {
    throw new Error(
      `the "${GATE_STEP_NAME}" step in ci.yml lists no tests/*.ts files — ` +
        `gate.sh's extraction over it would come up empty.`,
    );
  }
  const missing = files.filter((f) => {
    try {
      Deno.statSync(`${ROOT}/${f}`);
      return false;
    } catch {
      return true;
    }
  });
  if (missing.length > 0) {
    throw new Error(
      `ci.yml's "${GATE_STEP_NAME}" step lists files that do not exist:\n  ` +
        missing.join("\n  "),
    );
  }
});
