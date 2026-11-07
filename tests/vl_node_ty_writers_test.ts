// The node-type column is frozen at the end of emit prep (`nodeTyFreeze`), and an identity read
// (`elabIdentityTy`) answers from the type each node had then. That holds only while every
// in-place write goes through `nodeTySet`, which keeps the old type, and while the column is
// replaced only where the checker resets it, which unfreezes. Pure source scan, no seed.

import { ROOT } from "./support/tree.ts";

// The files allowed to replace the column, each resetting the freeze beside it.
const RESETS = ["check_core_state.vl", "check_program.vl"];

function sources(): [string, string][] {
  const out: [string, string][] = [];
  for (const e of Deno.readDirSync(`${ROOT}/compiler`)) {
    if (e.isFile && e.name.endsWith(".vl")) {
      out.push([e.name, Deno.readTextFileSync(`${ROOT}/compiler/${e.name}`)]);
    }
  }
  return out;
}

Deno.test("node-type column: nodeTySet is the only in-place writer", () => {
  const bad: string[] = [];
  for (const [name, src] of sources()) {
    src.split("\n").forEach((line, i) => {
      const code = line.replace(/\/\/.*$/, "");
      if (!/\bnodeTyIx\s*\[[^\]]*\]\s*=[^=]/.test(code)) return;
      if (
        name === "check_node_tys.vl" && /^\s*nodeTyIx\[ix\] = ty\s*$/.test(code)
      ) return;
      bad.push(`${name}:${i + 1}: ${line.trim()}`);
    });
  }
  if (bad.length > 0) {
    throw new Error(
      `write node types through nodeTySet, so a frozen entry keeps its old type:\n${
        bad.join("\n")
      }`,
    );
  }
});

Deno.test("node-type column: replaced only where the checker resets, with the freeze", () => {
  const bad: string[] = [];
  for (const [name, src] of sources()) {
    const lines = src.split("\n");
    lines.forEach((line, i) => {
      const code = line.replace(/\/\/.*$/, "");
      if (!/\bnodeTyIx\s*=[^=]/.test(code) || /\blet\s+nodeTyIx\b/.test(code)) {
        return;
      }
      const unfreezes = lines.slice(i, i + 3).some((l) =>
        l.includes("nodeTyUnfreeze()")
      );
      if (RESETS.includes(name) && unfreezes) return;
      bad.push(`${name}:${i + 1}: ${line.trim()}`);
    });
  }
  if (bad.length > 0) {
    throw new Error(
      `a replaced node-type column must call nodeTyUnfreeze() beside it, in a checker reset:\n${
        bad.join("\n")
      }`,
    );
  }
});

Deno.test("node-type column: the scan sees a direct write (control)", () => {
  const code = "  nodeTyIx[n] = t";
  if (!/\bnodeTyIx\s*\[[^\]]*\]\s*=[^=]/.test(code)) {
    throw new Error(
      "the direct-write pattern no longer matches a direct write",
    );
  }
});
