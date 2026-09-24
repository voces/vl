// `lsp/src/vlRoot.ts` — the editor's checkout-root detection, unit-tested directly.
//
// THE REGRESSION THIS FILE EXISTS FOR (review round 2). The editor used to
// relativize a document's path against whatever WORKSPACE FOLDER happened to be
// open, so an unrelated project opened as a workspace root — one with its own
// top-level `compiler/` or `std/` directory — could satisfy `compiler/lint.vl`'s
// PREFIX match by coincidence. Root anchoring fixes this at the source: a path is
// scoped only when it sits inside a directory that genuinely IS a VL checkout
// (both `compiler/entry.vl` and `std/fmt.vl` present), found by walking UP from the
// file itself, never from an open workspace folder.
//
// No seed needed — this is pure filesystem walking over real temp directories.

import { isVlCheckoutRoot, lintPathFor, resetVlRootCache, vlRootFor } from "../lsp/src/vlRoot.ts";
import { loadWasmChecker } from "../lsp/src/wasmCheckerNode.ts";
import { COMPILER, exists } from "./support/tree.ts";

const ENABLED = exists(COMPILER);
if (!ENABLED) {
  console.warn("[lsp-vl-root] end-to-end test skipped — no build/vl-compiler.wasm.");
}

/** A real VL checkout: `compiler/entry.vl` + `std/fmt.vl`, nothing else needed for
 * the marker check. */
const makeVlCheckout = async (root: string): Promise<void> => {
  await Deno.mkdir(`${root}/compiler`, { recursive: true });
  await Deno.mkdir(`${root}/std`, { recursive: true });
  await Deno.writeTextFile(`${root}/compiler/entry.vl`, "export {}\n");
  await Deno.writeTextFile(`${root}/std/fmt.vl`, "export function toStr(x: i32): string { \"\" }\n");
};

Deno.test("vlRoot: a real checkout's own file resolves to its own root", async () => {
  const dir = await Deno.makeTempDir({ prefix: "vl_root_" });
  resetVlRootCache();
  await makeVlCheckout(dir);
  await Deno.mkdir(`${dir}/compiler`, { recursive: true });
  await Deno.writeTextFile(`${dir}/compiler/lint.vl`, "// ok\n");

  if (!isVlCheckoutRoot(dir)) throw new Error(`want ${dir} to BE a checkout root`);
  const root = vlRootFor(`${dir}/compiler/lint.vl`);
  if (root !== dir) throw new Error(`want root ${dir}, got ${root}`);
  const path = lintPathFor(`${dir}/compiler/lint.vl`);
  if (path !== "compiler/lint.vl") {
    throw new Error(`want "compiler/lint.vl", got ${JSON.stringify(path)}`);
  }

  await Deno.remove(dir, { recursive: true });
});

Deno.test("vlRoot: a file NESTED under a checkout still resolves to the checkout's own root", async () => {
  const dir = await Deno.makeTempDir({ prefix: "vl_root_" });
  resetVlRootCache();
  await makeVlCheckout(dir);
  await Deno.mkdir(`${dir}/scripts/sub`, { recursive: true });
  await Deno.writeTextFile(`${dir}/scripts/sub/x.vl`, "// ok\n");

  const path = lintPathFor(`${dir}/scripts/sub/x.vl`);
  if (path !== "scripts/sub/x.vl") {
    throw new Error(`want "scripts/sub/x.vl", got ${JSON.stringify(path)}`);
  }

  await Deno.remove(dir, { recursive: true });
});

// THE EXACT SHAPE THE REVIEW REPORTED: an unrelated project with its own nested
// `src/compiler/` and `src/std/` directories, holding no VL checkout marker
// anywhere up its tree.
Deno.test("vlRoot: an UNRELATED project's own compiler/std directories resolve to no root", async () => {
  const dir = await Deno.makeTempDir({ prefix: "vl_root_fake_game_" });
  resetVlRootCache();
  await Deno.mkdir(`${dir}/src/compiler`, { recursive: true });
  await Deno.mkdir(`${dir}/src/std`, { recursive: true });
  await Deno.writeTextFile(`${dir}/src/compiler/parse.vl`, "// not vl's own compiler\n");
  await Deno.writeTextFile(`${dir}/src/std/util.vl`, "// not vl's own std\n");

  for (const rel of ["src/compiler/parse.vl", "src/std/util.vl"]) {
    const abs = `${dir}/${rel}`;
    const root = vlRootFor(abs);
    if (root !== undefined) {
      throw new Error(`${rel}: want no checkout root, got ${JSON.stringify(root)}`);
    }
    const path = lintPathFor(abs);
    if (path !== undefined) {
      throw new Error(`${rel}: want no scoping path, got ${JSON.stringify(path)}`);
    }
  }

  await Deno.remove(dir, { recursive: true });
});

// A directory named `compiler` or `std` alone is NOT the marker — both must be
// present, the same two `is_dev_tree` (scripts/vl-host/src/main.rs) checks.
Deno.test("vlRoot: one marker alone (compiler/ without std/, or the reverse) is not a root", async () => {
  const dir = await Deno.makeTempDir({ prefix: "vl_root_half_" });
  resetVlRootCache();
  await Deno.mkdir(`${dir}/compiler`, { recursive: true });
  await Deno.writeTextFile(`${dir}/compiler/entry.vl`, "export {}\n");
  await Deno.writeTextFile(`${dir}/compiler/lint.vl`, "// ok\n");

  if (isVlCheckoutRoot(dir)) throw new Error(`want ${dir} NOT to be a checkout root (no std/fmt.vl)`);
  const root = vlRootFor(`${dir}/compiler/lint.vl`);
  if (root !== undefined) throw new Error(`want no root, got ${JSON.stringify(root)}`);

  await Deno.remove(dir, { recursive: true });
});

// A WORKTREE-shaped nesting: a real VL checkout sitting INSIDE another directory
// tree that also has a `compiler/`/`std/` pair further up (a checkout nested under
// another, e.g. `.claude/worktrees/<id>/` inside the main checkout). The NEAREST
// marker wins, not the outermost — a worktree must scope to ITS OWN tree.
Deno.test("vlRoot: the NEAREST checkout root wins over an outer one", async () => {
  const outer = await Deno.makeTempDir({ prefix: "vl_root_outer_" });
  resetVlRootCache();
  await makeVlCheckout(outer);
  const inner = `${outer}/.claude/worktrees/fake-agent`;
  await makeVlCheckout(inner);
  await Deno.mkdir(`${inner}/compiler`, { recursive: true });
  await Deno.writeTextFile(`${inner}/compiler/lint.vl`, "// ok\n");

  const root = vlRootFor(`${inner}/compiler/lint.vl`);
  if (root !== inner) {
    throw new Error(`want the nearest (inner) root ${inner}, got ${JSON.stringify(root)}`);
  }
  const path = lintPathFor(`${inner}/compiler/lint.vl`);
  if (path !== "compiler/lint.vl") {
    throw new Error(`want "compiler/lint.vl" relative to the inner root, got ${JSON.stringify(path)}`);
  }

  await Deno.remove(outer, { recursive: true });
});

// END TO END, THROUGH THE REAL `wasmChecker.lint()`, exactly as the review asked:
// `lintPathFor`'s answer for a fake project's own `src/compiler/x.vl` fed into the
// same lint the editor calls on every keystroke — proving the WHOLE pipeline, not
// just the path computation in isolation.
Deno.test({
  name: "vlRoot + wasmChecker.lint: an unrelated project's own compiler/ gets prefer-interpolation, never compiler-no-interpolation",
  ignore: !ENABLED,
  fn: async () => {
    const dir = await Deno.makeTempDir({ prefix: "vl_root_e2e_fake_game_" });
    resetVlRootCache();
    await Deno.mkdir(`${dir}/src/compiler`, { recursive: true });
    const target = `${dir}/src/compiler/x.vl`;
    const source = 'export function f(x: i32): string {\n  "n=\\{x}"\n}\n\n' +
      'const chain = "a" + "b" + "c" + "d"\n';
    await Deno.writeTextFile(target, source);

    const path = lintPathFor(target);
    if (path !== undefined) {
      throw new Error(`want no scoping path for ${target}, got ${JSON.stringify(path)}`);
    }
    const checker = loadWasmChecker(COMPILER, () => {})!;
    const diags = checker.lint(source, path);
    const forbidden = diags.filter((d) => d.code === "compiler-no-interpolation");
    if (forbidden.length !== 0) {
      throw new Error(`compiler-no-interpolation fired outside any VL checkout: ${JSON.stringify(forbidden)}`);
    }
    const interp = diags.filter((d) => d.code === "prefer-interpolation");
    if (interp.length !== 1) {
      throw new Error(`want one prefer-interpolation finding (the \`+\` chain), got ${JSON.stringify(interp)}`);
    }

    await Deno.remove(dir, { recursive: true });
  },
});
