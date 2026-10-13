// The quiet probes' rollback census (code-quality-2026-10.md L4). Compiles every `.vl` under
// the given roots on the wasm seed, with the checker's rollback assertion armed
// (`probeRollbackArm`), and prints which probe leaves which table behind: per row, how many
// probe runs moved it, in how many programs, and one program that shows it.
//
//   deno run -A scripts/probe-rollback-census.ts [--seed S] [--shard k/n] [--json] ROOT...
//   deno run -A scripts/probe-rollback-census.ts --fingerprint [--seed S] [--shard k/n] ROOT...
//
// `--fingerprint` leaves the assertion off and prints one line per program: its rc and a hash
// of its diagnostics and emitted bytes. Two seeds' fingerprints diffing empty is the proof that
// the disarmed assertion changed no `vl check` text and no emitted module.

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
const fingerprint = flag("--fingerprint") ?? false;
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
  if (armed) exp.probeRollbackArm(1);
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

if (fingerprint) {
  for (const f of mine) {
    const { rc, exp } = compile(f, false);
    const parts: string[] = [String(rc)];
    if (typeof rc === "number" && rc !== 0) {
      for (let i = 0; i < exp.diagCount(); i++) {
        parts.push(
          `${exp.diagLine(i)}:${exp.diagCol(i)} ${
            readStr(exp.diagMsgLen(i), (j) => exp.diagMsgAt(i, j))
          }`,
        );
      }
    }
    if (rc === 0) {
      const n = exp.rbyteLen();
      const b = new Uint8Array(n);
      for (let i = 0; i < n; i++) b[i] = exp.rbyteAt(i);
      parts.push(
        Array.from(
          new Uint8Array(await crypto.subtle.digest("SHA-256", b)),
          (x) => x.toString(16).padStart(2, "0"),
        ).join(""),
      );
    }
    console.log(`${f.replace(`${Deno.cwd()}/`, "")}\t${parts.join("\t")}`);
  }
} else {
  const rows = new Map<
    string,
    { runs: number; programs: number; example: string }
  >();
  for (const f of mine) {
    const { exp } = compile(f, true);
    for (let i = 0; i < exp.probeRollbackRowCount(); i++) {
      const key = readStr(
        exp.probeRollbackRowLen(i),
        (j) => exp.probeRollbackRowAt(i, j),
      );
      const r = rows.get(key) ??
        { runs: 0, programs: 0, example: f.replace(`${Deno.cwd()}/`, "") };
      r.runs += exp.probeRollbackRowN(i);
      r.programs += 1;
      rows.set(key, r);
    }
  }
  const sorted = [...rows].sort(([a], [b]) => a < b ? -1 : 1);
  if (asJson) console.log(JSON.stringify(Object.fromEntries(sorted)));
  else {
    console.log(`${mine.length} programs`);
    for (const [k, r] of sorted) {
      console.log(`${k}\t${r.runs} runs\t${r.programs} programs\t${r.example}`);
    }
  }
}
