// A list element, map key or map value is read only through `tyElemOf`/`tyKeyOf`/`tyValOf` and
// tested only with `tyOpen` (check_types.vl): an open child is stored as a hole code that only
// those functions decode, so a direct `.aElem`/`.mKey`/`.mVal` read elsewhere sees the code, not
// the type. Pure source scan, no seed; comment lines are skipped.

import { ROOT } from "./support/tree.ts";

const OWNER = "check_types.vl";
const FIELD = /\.(aElem|mKey|mVal)\b/;

Deno.test("type children: no direct child-field read outside check_types.vl", () => {
  const hits: string[] = [];
  for (const e of Deno.readDirSync(`${ROOT}/compiler`)) {
    if (!e.isFile || !e.name.endsWith(".vl") || e.name === OWNER) continue;
    const lines = Deno.readTextFileSync(`${ROOT}/compiler/${e.name}`).split("\n");
    lines.forEach((line, i) => {
      if (/^\s*\/\//.test(line)) return;
      const code = line.replace(/\/\/.*$/, "");
      if (FIELD.test(code)) hits.push(`compiler/${e.name}:${i + 1}: ${line.trim()}`);
    });
  }
  // The null-fold tie rewrites one field in place until stage 2c moves it onto a hole solve.
  const allowed = hits.filter((h) => !h.includes("ft.aElem = nulFoldTiedTyAt("));
  if (allowed.length > 0) {
    throw new Error(
      `want every child read through tyElemOf/tyKeyOf/tyValOf, got ${allowed.length}:\n` +
        allowed.join("\n"),
    );
  }
});
