// The pin guard's census (L2 S3.2, `refactor-notes/2026-11-16-l2-s3-plan.md`). Compiles every
// `.vl` under the given roots on the wasm seed with the guard armed (`pinGuardArm`), and prints
// each hole write the call solver made inside a delivery question: per row (writer and the
// delivery's node), how many writes, in how many programs, and one program that shows it.
// `--control` also counts writes outside a delivery question, which must be non-empty: it proves
// the hook fires.
//
//   deno run -A scripts/pin-guard-census.ts [--control] [--seed S] [--shard k/n] [--json] ROOT...

import { needsModules } from "../compiler/moduleGate.ts";

type Exports = Record<string, (...args: number[]) => number>;

const args = [...Deno.args];
const flag = (name: string) => {
  const i = args.indexOf(name);
  if (i < 0) return undefined;
  args.splice(i, 1);
  return true;
};
const opt = (name: string) => {
  const i = args.indexOf(name);
  if (i < 0) return undefined;
  const v = args[i + 1];
  args.splice(i, 2);
  return v;
};
const control = flag("--control") ?? false;
const asJson = flag("--json") ?? false;
const seed = opt("--seed") ?? "build/vl-compiler.wasm";
const [shardK, shardN] = (opt("--shard") ?? "0/1").split("/").map(Number);
const stdDir = `${Deno.cwd()}/std/`;

const walk = (p: string, out: string[]) => {
  const st = Deno.statSync(p);
  if (st.isFile) {
    if (p.endsWith(".vl")) out.push(p);
    return;
  }
  const names = [...Deno.readDirSync(p)].map((e) => e.name).sort();
  for (const n of names) walk(`${p}/${n}`, out);
};
const files: string[] = [];
for (const r of args) walk(Deno.realPathSync(r), files);
const mine = files.filter((_, i) => i % shardN === shardK);

const compiled = new WebAssembly.Module(Deno.readFileSync(seed));
const push = (f: (cp: number) => number, s: string) => {
  for (const ch of s) f(ch.codePointAt(0)!);
};
const readStr = (len: number, at: (j: number) => number) => {
  const b = new Uint8Array(len);
  for (let j = 0; j < len; j++) b[j] = at(j);
  return new TextDecoder().decode(b);
};
const readModule = (key: string): string | undefined => {
  try {
    return Deno.readTextFileSync(
      key.startsWith("std:") ? `${stdDir}${key.slice(4)}.vl` : key,
    );
  } catch {
    return undefined;
  }
};

/** One program on a fresh instance: the rc, and the instance for reading back. */
const compile = (path: string, armed: boolean) => {
  const exp = new WebAssembly.Instance(compiled, {})
    .exports as unknown as Exports;
  if (armed) exp.pinGuardArm(1, control ? 1 : 0);
  const src = Deno.readTextFileSync(path);
  exp.modReset();
  if (needsModules(src)) {
    const commit = (key: string, s: string | undefined) => {
      push(exp.modKeyPush, key);
      if (s !== undefined) push(exp.modSrcPush, s);
      exp.modCommit(s !== undefined ? 1 : 0);
    };
    commit(path, src);
    for (;;) {
      const n = exp.modPendingCount();
      if (n === 0) break;
      const keys: string[] = [];
      for (let i = 0; i < n; i++) {
        keys.push(readStr(exp.modPendingLen(i), (j) => exp.modPendingAt(i, j)));
      }
      for (const k of keys) commit(k, readModule(k));
    }
  }
  exp.srcReset();
  push(exp.srcPush, src);
  let rc: number | string;
  try {
    rc = exp.compileSrc();
  } catch (e) {
    rc = `trap ${(e as Error).message}`;
  }
  return { rc, exp };
};

const rows = new Map<
  string,
  { runs: number; programs: number; example: string }
>();
for (const f of mine) {
  const { exp } = compile(f, true);
  for (let i = 0; i < exp.pinGuardRowCount(); i++) {
    const key = readStr(exp.pinGuardRowLen(i), (j) => exp.pinGuardRowAt(i, j));
    const r = rows.get(key) ??
      { runs: 0, programs: 0, example: f.replace(`${Deno.cwd()}/`, "") };
    r.runs += exp.pinGuardRowN(i);
    r.programs += 1;
    rows.set(key, r);
  }
}
const sorted = [...rows].sort(([a], [b]) => a < b ? -1 : 1);
if (asJson) console.log(JSON.stringify(Object.fromEntries(sorted)));
else {
  console.log(
    `${mine.length} programs, ${rows.size} rows${control ? " (control)" : ""}`,
  );
  for (const [k, r] of sorted) {
    console.log(`${k}\t${r.runs} writes\t${r.programs} programs\t${r.example}`);
  }
}
