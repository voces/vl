// A DOCS-ONLY CHANGE STILL RUNS EVERY CHECK THAT READS A DOC.
//
// .github/actions/docs-only calls a change "docs-only" when every path is *.md or docs/**,
// and CI then skips the seed-backed jobs. The `ci` job runs .github/docs-checks.txt instead,
// so that list must name every test that reads a doc, and each must run without the seed.
// A test "may read a doc" when a non-comment line names `docs/`, a `.md` file, or
// `git ls-files`; each such test is either listed or named below with the reason it is not
// a reader. No assertion library, per CLAUDE.md.

const ROOT = new URL("..", import.meta.url).pathname;
const LIST = ".github/docs-checks.txt";

// Mentions a doc only in a failure message, or reads only .md fixtures it writes itself.
const NOT_READERS: Record<string, string> = {
  "tests/selfhost_native_release_test.ts": "message",
  "tests/selfhost_native_release_loops_test.ts": "message",
  "tests/selfhost_native_release_melt_test.ts": "message",
  "tests/vl_buffer_view_bounds_shape_test.ts": "message",
  "tests/vl_comment_budget_test.ts": "message",
  "tests/vl_gc_heap_shape_test.ts": "message",
  "tests/vl_instance_state_leak_test.ts": "message",
  "tests/vl_memo_generation_test.ts": "message",
  "tests/vl_opt_after_link_test.ts": "message",
  "tests/vl_scaling_shape_test.ts": "message",
  "tests/vl_seed_gc_headroom_test.ts": "message",
  "tests/vl_view_descriptor_melt_test.ts": "message",
  "tests/vl_check_filed_witnesses_test.ts": "fixture",
  "tests/vl_inventory_ls_test.ts": "fixture",
  "tests/vl_seed_provenance_test.ts": "fixture",
  "tests/vl_survey_regrade_port_test.ts": "fixture",
  "tests/ci_docs_only_test.ts": "this guard: reads only the list and ci.yml",
};

const MAY_READ = /docs(\/|\\\/)|\.md\b|ls-files/;
const COMMENT = /^\s*(\/\/|\*|\/\*)/;
const SEEDED =
  /import\s*\{[^}]*\b(VL|COMPILER)\b[^}]*\}\s*from\s*"\.\/support\/tree\.ts"|vl-compiler\.wasm/;

const read = (p: string) => Deno.readTextFileSync(`${ROOT}${p}`);
const code = (p: string) =>
  read(p).split("\n").filter((l) => !COMMENT.test(l)).join("\n");

function sources(): string[] {
  const out: string[] = [];
  for (const e of Deno.readDirSync(`${ROOT}tests`)) {
    if (e.isFile && e.name.endsWith("_test.ts")) out.push(`tests/${e.name}`);
  }
  for (const e of Deno.readDirSync(`${ROOT}tests/support`)) {
    if (e.isFile && e.name.endsWith(".ts")) out.push(`tests/support/${e.name}`);
  }
  return out.sort();
}

const listed = read(LIST).split("\n").map((l) => l.trim()).filter((l) =>
  l !== "" && !l.startsWith("#")
);

Deno.test("every test that may read a doc is in the docs-only list or named as no reader", () => {
  const missing = sources().filter((p) =>
    MAY_READ.test(code(p)) && !listed.includes(p) && !(p in NOT_READERS)
  );
  if (missing.length > 0) {
    throw new Error(
      `want each in ${LIST} (a seedless doc reader) or in NOT_READERS here, got neither for:\n  ` +
        missing.join("\n  ") +
        `\n  A reader that needs the seed cannot run on a docs-only change: carve the doc it reads` +
        ` out of the pattern in .github/actions/docs-only/action.yml instead.`,
    );
  }
});

Deno.test("every NOT_READERS entry still exists and still mentions a doc", () => {
  const stale = Object.keys(NOT_READERS).filter((p) => {
    try {
      return !MAY_READ.test(code(p));
    } catch {
      return true;
    }
  });
  if (stale.length > 0) {
    throw new Error(
      `want no stale NOT_READERS entries, got:\n  ${stale.join("\n  ")}`,
    );
  }
});

Deno.test("every docs-only check exists, needs no seed, and is not also a NOT_READERS entry", () => {
  const bad: string[] = [];
  for (const p of listed) {
    let src: string;
    try {
      src = read(p);
    } catch {
      bad.push(`${p}: no such file`);
      continue;
    }
    if (SEEDED.test(src)) {
      bad.push(
        `${p}: uses the vl binary or the seed, which a docs-only run does not build`,
      );
    }
    if (p in NOT_READERS) bad.push(`${p}: listed and also named as no reader`);
  }
  if (listed.length === 0) bad.push(`${LIST}: lists no test`);
  if (bad.length > 0) {
    throw new Error(
      `want every ${LIST} entry runnable seedless, got:\n  ${bad.join("\n  ")}`,
    );
  }
});

Deno.test("the ci job runs the list when the change is docs-only", () => {
  const ci = read(".github/workflows/ci.yml");
  const step =
    /if: steps\.docs_check\.outputs\.docs_only == 'true'\n\s+run: deno test [^\n]*\.github\/docs-checks\.txt/;
  if (!step.test(ci)) {
    throw new Error(
      `want a ci.yml step gated on docs_only == 'true' that runs ${LIST}, got none`,
    );
  }
});
