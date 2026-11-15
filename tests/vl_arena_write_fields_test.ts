// The node field list `arena-write-after-lower` (compiler/lint.vl) reads must stay ast.vl's.
//
// The rule counts writes into existing nodes by field name, because lint sees no types. Its list
// `awFields` is every field of ast.vl's `Node` variants, minus the names another record type in
// compiler/ also declares. A field added to a variant and not to the list would leave its writes
// uncounted; this names the difference instead.
//
// Pure file reads: no seed, no binary.

import { filePath } from "./support/filePath.ts";

const ROOT = filePath(new URL("../", import.meta.url)).replace(/[\\/]$/, "");
const read = (rel: string): string => Deno.readTextFileSync(`${ROOT}/${rel}`);

/** The quoted entries of `const <name> = [ … ]` in a VL source. */
const vlList = (src: string, name: string): string[] => {
  const m = new RegExp(`^const ${name} = \\[\\n([\\s\\S]*?)^\\]$`, "m").exec(
    src,
  );
  if (m === null) {
    throw new Error(`compiler/lint.vl has no \`const ${name} = [\``);
  }
  return [...m[1].matchAll(/"([^"]*)"/g)].map((x) => x[1]);
};

/** The top-level field names of a `{ … }` body, one line or many. */
const fieldsOf = (body: string): string[] => {
  const out: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i <= body.length; i++) {
    const c = body[i];
    if (c === "{" || c === "[" || c === "(") depth++;
    else if (c === "}" || c === "]" || c === ")") depth--;
    else if ((c === "," && depth === 0) || i === body.length) {
      const m = /^\s*(?:\/\/[^\n]*\n\s*)*(\w+)\s*:/.exec(body.slice(start, i));
      if (m) out.push(m[1]);
      start = i + 1;
    }
  }
  return out;
};

/** Each record type's field names, by type name, over compiler/*.vl. */
const recordFields = (): Map<string, string[]> => {
  const out = new Map<string, string[]>();
  for (const e of Deno.readDirSync(`${ROOT}/compiler`)) {
    if (!e.name.endsWith(".vl")) continue;
    const src = read(`compiler/${e.name}`);
    for (const t of src.matchAll(/^(?:export )?type (\w+) = \{/gm)) {
      let depth = 0;
      let i = t.index! + t[0].length - 1;
      const open = i;
      for (; i < src.length; i++) {
        if (src[i] === "{") depth++;
        else if (src[i] === "}" && --depth === 0) break;
      }
      out.set(t[1], fieldsOf(src.slice(open + 1, i).replace(/\/\/[^\n]*/g, "")));
    }
  }
  return out;
};

Deno.test("arena-write: awFields is every Node variant field no other record declares", () => {
  const ast = read("compiler/ast.vl");
  const at = ast.indexOf("export type Node =");
  if (at < 0) throw new Error("compiler/ast.vl has no `export type Node =`");
  const members = ast.slice(at + 18, ast.indexOf("\n\n", at)).split("|").map((
    x,
  ) => x.trim());
  const recs = recordFields();
  const nodeFields = new Set<string>();
  for (const m of members) for (const f of recs.get(m) ?? []) nodeFields.add(f);
  if (nodeFields.size === 0) {
    throw new Error("read no Node variant field: the reader is blind");
  }
  const shared = new Set<string>();
  for (const [t, fs] of recs) {
    if (members.includes(t)) continue;
    for (const f of fs) if (nodeFields.has(f)) shared.add(f);
  }
  const want = [...nodeFields].filter((f) => !shared.has(f)).sort();
  const got = vlList(read("compiler/lint.vl"), "awFields").slice().sort();
  const missing = want.filter((f) => !got.includes(f));
  const extra = got.filter((f) => !want.includes(f));
  if (missing.length !== 0 || extra.length !== 0) {
    throw new Error(
      `want awFields to match ast.vl's Node fields; missing ${
        JSON.stringify(missing)
      }, ` +
        `extra ${JSON.stringify(extra)}`,
    );
  }
});
