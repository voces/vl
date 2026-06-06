// Unit tests for the `vl check --exclude`/`--ignore` machinery: the glob-aware
// exclude matcher and `collectVlFiles`'s filtering on top of `SKIP_DIRS`.
//
// `makeExcludeMatcher` matches a candidate two ways and skips on either: the
// path RELATIVE TO THE CHECK ROOT, and the BASENAME. `*` stops at a path
// separator, `**` crosses it. `collectVlFiles` applies that to directories and
// files while walking. We build a tiny throwaway tree under a temp dir so the
// directory-walk behaviour is exercised end to end. Run with:
//   deno test -A --no-check tests/cli_excludes_test.ts

import { collectVlFiles, makeExcludeMatcher } from "../compiler/cli.ts";

const assert = (cond: boolean, msg: string): void => {
  if (!cond) throw new Error(msg);
};

const assertEquals = <T>(actual: T, expected: T, msg?: string): void => {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) {
    throw new Error(`${msg ? msg + ": " : ""}expected ${e}, got ${a}`);
  }
};

// --- the matcher in isolation ---------------------------------------------

Deno.test("makeExcludeMatcher: no patterns matches nothing", () => {
  const m = makeExcludeMatcher([]);
  assert(!m("tests/a.vl", "a.vl"), "empty matcher must not match");
});

Deno.test("makeExcludeMatcher: directory pattern gates the whole subtree", () => {
  const m = makeExcludeMatcher(["tests"]);
  assert(m("tests", "tests"), "matches the dir itself");
  assert(m("tests/a.vl", "a.vl"), "matches a file beneath it");
  assert(m("tests/sub/b.vl", "b.vl"), "matches a nested file");
  assert(!m("src/a.vl", "a.vl"), "must not match an unrelated path");
  assert(!m("attests/a.vl", "a.vl"), "must not match a prefix collision");
});

Deno.test("makeExcludeMatcher: `*` glob matches by basename, stops at /", () => {
  const m = makeExcludeMatcher(["*.gen.vl"]);
  assert(m("src/x.gen.vl", "x.gen.vl"), "matches generated basename anywhere");
  assert(m("a/b/c.gen.vl", "c.gen.vl"), "matches deeply nested generated file");
  assert(!m("src/x.vl", "x.vl"), "must not match a plain .vl file");
});

Deno.test("makeExcludeMatcher: nested path and `**` glob", () => {
  const m = makeExcludeMatcher(["tests/fixtures"]);
  assert(m("tests/fixtures/a.vl", "a.vl"), "matches a nested directory path");
  assert(!m("tests/other/a.vl", "a.vl"), "must not match a sibling dir");

  const star2 = makeExcludeMatcher(["tests/**/skip.vl"]);
  assert(star2("tests/a/b/skip.vl", "skip.vl"), "** crosses separators");
});

Deno.test("makeExcludeMatcher: normalizes ./ prefix and trailing /", () => {
  const m = makeExcludeMatcher(["./tests/"]);
  assert(m("tests/a.vl", "a.vl"), "./tests/ behaves like tests");
});

// --- collectVlFiles, walking a real temp tree ------------------------------

const makeTree = async (): Promise<string> => {
  const root = await Deno.makeTempDir({ prefix: "vl_excl_" });
  await Deno.mkdir(`${root}/src`, { recursive: true });
  await Deno.mkdir(`${root}/tests/fixtures`, { recursive: true });
  await Deno.writeTextFile(`${root}/src/main.vl`, "let x = 1\n");
  await Deno.writeTextFile(`${root}/src/gen.gen.vl`, "let y = 2\n");
  await Deno.writeTextFile(`${root}/tests/a.vl`, "let z = 3\n");
  await Deno.writeTextFile(`${root}/tests/fixtures/f.vl`, "let w = 4\n");
  return root;
};

// Paths come back absolute and rooted at the temp dir; compare on the suffix
// relative to root for stable, location-independent assertions.
const rel = (root: string, paths: string[]): string[] =>
  paths.map((p) => p.slice(root.length + 1)).sort();

Deno.test("collectVlFiles: without excludes, every .vl is collected", async () => {
  const root = await makeTree();
  try {
    const files = rel(root, await collectVlFiles(root));
    assertEquals(files, [
      "src/gen.gen.vl",
      "src/main.vl",
      "tests/a.vl",
      "tests/fixtures/f.vl",
    ]);
  } finally {
    await Deno.remove(root, { recursive: true });
  }
});

Deno.test("collectVlFiles: --exclude tests skips the whole subtree", async () => {
  const root = await makeTree();
  try {
    const files = rel(root, await collectVlFiles(root, ["tests"]));
    assertEquals(files, ["src/gen.gen.vl", "src/main.vl"]);
  } finally {
    await Deno.remove(root, { recursive: true });
  }
});

Deno.test("collectVlFiles: glob exclude skips a matching file only", async () => {
  const root = await makeTree();
  try {
    const files = rel(root, await collectVlFiles(root, ["*.gen.vl"]));
    assert(!files.includes("src/gen.gen.vl"), "generated file is excluded");
    assert(files.includes("src/main.vl"), "plain file still collected");
    assert(files.includes("tests/a.vl"), "unrelated file still collected");
  } finally {
    await Deno.remove(root, { recursive: true });
  }
});

Deno.test("collectVlFiles: nested-path exclude skips one dir only", async () => {
  const root = await makeTree();
  try {
    const files = rel(root, await collectVlFiles(root, ["tests/fixtures"]));
    assert(!files.includes("tests/fixtures/f.vl"), "fixtures dir is excluded");
    assert(files.includes("tests/a.vl"), "sibling test file kept");
  } finally {
    await Deno.remove(root, { recursive: true });
  }
});
