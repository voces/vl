// The architecture's pin and position layer (architecture-target-2026-10.md §4.1, the
// "special-case helpers (a)" row) is meant to shrink to nothing as the elaboration
// takes over. Between 2026-10-25 and 2026-11-04 it grew from 1,516 to 1,571 functions
// while its replacement was built beside it, because nothing graded it. This holds the
// count per file: it may fall, never rise. A PR that deletes helpers lowers the
// baseline JSON in the same PR. Pure source scan, no seed.

import { ROOT } from "./support/tree.ts";

const BASELINE = `${ROOT}/scripts/pin-helper-budget-baseline.json`;
const FILES = ["emit_mono.vl", "fn_flow_shadow.vl"];

function countFns(file: string): number {
  let src: string;
  try {
    src = Deno.readTextFileSync(`${ROOT}/compiler/${file}`);
  } catch {
    return 0; // a deleted file has no helpers left
  }
  return (src.match(/^(export )?function\s/gm) ?? []).length;
}

Deno.test("pin-helper budget: the pin and position layer never grows", () => {
  const base = JSON.parse(Deno.readTextFileSync(BASELINE));
  const rose: string[] = [];
  const fell: string[] = [];
  for (const f of FILES) {
    const want = base[f];
    if (typeof want !== "number") {
      throw new Error(`${BASELINE} has no count for ${f}`);
    }
    const got = countFns(f);
    if (got > want) rose.push(`${f}: ${want} -> ${got}`);
    if (got < want) fell.push(`${f}: ${want} -> ${got}`);
  }
  if (fell.length > 0) {
    console.log(
      `pin-helper budget fell (lower the baseline in this PR): ${
        fell.join("; ")
      }`,
    );
  }
  if (rose.length > 0) {
    throw new Error(
      `the pin and position layer grew: ${rose.join("; ")}. ` +
        `Retire a helper for each one added, or say in the PR why the architecture ` +
        `needs it and raise ${BASELINE} there.`,
    );
  }
});

Deno.test("pin-helper budget: a control that adds a helper reds", () => {
  const src =
    "function a() {}\nexport function b() {}\n  function nested() {}\n";
  const n = (src.match(/^(export )?function\s/gm) ?? []).length;
  if (n !== 2) throw new Error(`want 2 top-level functions, got ${n}`);
});
