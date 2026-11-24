// `scripts/silent-sweep/distilled/heavy-programs.txt` names the programs `ir-shadow.vl` runs after its
// fan-out, one process, because each builds at a multi-GB peak: two in parallel chunks once summed
// past a 15 GB box. Each entry must still name something: a row id filed `runs` (its staged witness
// is what the claims run builds) or a checkout file. A stale entry would isolate nothing and hide
// that a heavy program moved. No assertion library, per CLAUDE.md.
//
// Run with:  deno test -A tests/vl_heavy_programs_test.ts

import { exists, ROOT } from "./support/tree.ts";

const LIST = `${ROOT}/scripts/silent-sweep/distilled/heavy-programs.txt`;
const entries = Deno.readTextFileSync(LIST)
  .split("\n")
  .filter((l) => l !== "" && !l.startsWith("#"))
  .map((l) => l.split("\t"));

Deno.test("heavy programs: every entry has a key, a numeric peak and a reason", () => {
  for (const e of entries) {
    if (e.length !== 3 || e[0] === "" || !/^\d+$/.test(e[1]) || e[2].trim() === "") {
      throw new Error(`want \`<key>\\t<peak MiB>\\t<why>\`, got ${JSON.stringify(e)}`);
    }
  }
});

Deno.test("heavy programs: every entry names a filed `runs` row or an existing file", () => {
  for (const [key] of entries) {
    if (/^D\d+$/.test(key)) {
      const row = [`${ROOT}/docs/internals/inventory/${key}.md`, `${ROOT}/docs/internals/inventory-2/${key}.md`].find(exists);
      if (row === undefined) throw new Error(`want an inventory row for ${key}, got none`);
      const status = Deno.readTextFileSync(row).split("\n").find((l) => l.startsWith("**")) ?? "";
      if (!/\bruns\b/.test(status)) throw new Error(`want ${key} filed \`runs\` (the claims run builds its witness), got: ${status.slice(0, 160)}`);
    } else if (!exists(`${ROOT}/${key}`)) {
      throw new Error(`want ${key} to exist, got no file`);
    }
  }
});

Deno.test("heavy programs: ir-shadow.vl reads the list", () => {
  const src = Deno.readTextFileSync(`${ROOT}/scripts/silent-sweep/distilled/ir-shadow.vl`);
  if (!src.includes('"scripts/silent-sweep/distilled/heavy-programs.txt"')) {
    throw new Error("want ir-shadow.vl to read heavy-programs.txt, got no reference");
  }
});
