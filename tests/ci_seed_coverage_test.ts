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

const ROOT = new URL("../", import.meta.url).pathname.replace(/\/$/, "");
const TESTS_DIR = `${ROOT}/tests`;
const CI_YML = `${ROOT}/.github/workflows/ci.yml`;

// This guard mentions the seed path + scan markers as needles, so exclude it
// from its own scan.
const SELF = "ci_seed_coverage_test.ts";

// A file is seed-backed if it references the seed wasm AND gates on its presence
// (the `statSync`/`exists(` self-ignore). Both must hold so a passing mention
// (e.g. a comment) doesn't count.
const isSeedBacked = (src: string): boolean =>
  src.includes("vl-compiler.wasm") &&
  (src.includes("statSync") || src.includes("exists("));

// The two auto-discovery globs `ci-native` runs (see ci.yml's native-suites step).
const coveredByGlob = (name: string): boolean =>
  /^selfhost_native_.*_test\.ts$/.test(name) || /^vl_.*_test\.ts$/.test(name);

Deno.test("ci-seed-coverage: every seed-backed test runs in ci-native (glob or explicit)", () => {
  const ci = Deno.readTextFileSync(CI_YML);

  const seedBacked: string[] = [];
  for (const entry of Deno.readDirSync(TESTS_DIR)) {
    if (!entry.isFile || !entry.name.endsWith("_test.ts")) continue;
    if (entry.name === SELF) continue;
    const src = Deno.readTextFileSync(`${TESTS_DIR}/${entry.name}`);
    if (isSeedBacked(src)) seedBacked.push(entry.name);
  }

  if (seedBacked.length === 0) {
    throw new Error(
      "found no seed-backed tests — the detection heuristic likely broke; " +
        "verify it still matches the seed self-ignore convention",
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
