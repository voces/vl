// Detecting which files ARE the VL checkout, so a path-scoped compiler/lint.vl rule
// (`compiler-no-interpolation`, `prefer-interpolation`'s `compiler/` exclusion,
// `std-comment-audience`) fires only for that tree's own `compiler/`/`std/`, never
// for an unrelated project's directory of the same name.
//
// THE BUG THIS FIXES (review round 2). The editor used to relativize a document's
// path against whatever WORKSPACE FOLDER the editor had open, then had
// `compiler/lint.vl`'s `scaIsCompiler`/`scaIsStd` widened to match `/compiler/` or
// `/std/` as a path SEGMENT anywhere, to cover an absolute CLI target too. Together
// these fired on `src/compiler/parse.vl` and `/home/u/game/src/std/util.vl` in an
// UNRELATED user project — the workspace root was never the VL checkout, and the
// segment match could not tell the two apart. The fix drops the segment match
// (`compiler/lint.vl` is prefix-only again) and instead walks UP from the FILE
// ITSELF, independent of any open workspace, looking for the checkout's own markers
// — the same shape `scripts/vl-host/src/main.rs`'s `is_dev_tree`/`lintScopeKeyOf`
// give the CLI, so the editor and the CLI agree on the same tree.

import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { workspaceRelative } from "./ratchetHold.ts";

/**
 * Whether `dir` IS a VL checkout root: both `compiler/entry.vl` and `std/fmt.vl`
 * present as direct children. Two markers, not one, the same reason
 * `scripts/vl-host/src/main.rs`'s `is_dev_tree` uses two — `std/` alone is also
 * what an unrelated project's own top-level directory can be named.
 */
export const isVlCheckoutRoot = (dir: string): boolean =>
  existsSync(join(dir, "compiler", "entry.vl")) &&
  existsSync(join(dir, "std", "fmt.vl"));

/**
 * The nearest ancestor of `filePath` (its own directory, or one further up) that IS
 * a VL checkout root, or undefined when none is. Walked from the FILE, not from an
 * open workspace folder, so an unrelated project's own root never qualifies and a
 * worktree resolves to ITS OWN `compiler/`/`std/`, not a sibling checkout's.
 * Memoized per directory queried, since `lint()` runs on every keystroke and the
 * markers do not move mid-session; `resetVlRootCache` is for tests only.
 */
const vlRootCache = new Map<string, string | undefined>();

export const resetVlRootCache = (): void => {
  vlRootCache.clear();
};

export const vlRootFor = (filePath: string): string | undefined => {
  const visited: string[] = [];
  let dir = dirname(filePath);
  for (;;) {
    if (vlRootCache.has(dir)) {
      const found = vlRootCache.get(dir);
      for (const d of visited) vlRootCache.set(d, found);
      return found;
    }
    visited.push(dir);
    if (isVlCheckoutRoot(dir)) {
      for (const d of visited) vlRootCache.set(d, dir);
      return dir;
    }
    const parent = dirname(dir);
    if (parent === dir) {
      for (const d of visited) vlRootCache.set(d, undefined);
      return undefined;
    }
    dir = parent;
  }
};

/**
 * `filePath` as `lint()`'s `path` argument wants it: relative to the nearest VL
 * checkout root above it. `compiler/lint.vl`'s `scaIsCompiler`/`scaIsStd` then
 * prefix-match it, exactly as the CLI does for a target run from its own checkout
 * root. `undefined` outside any VL checkout: the rules that read it just decline,
 * the same as before this channel existed.
 */
export const lintPathFor = (filePath: string): string | undefined => {
  const root = vlRootFor(filePath);
  return root === undefined ? undefined : workspaceRelative(root, filePath);
};
