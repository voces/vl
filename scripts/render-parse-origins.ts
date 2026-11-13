// Grades each type-string parse site the render-parse census counts by where its input spelling
// came from, and writes scripts/render-parse-origins.txt, which the census reads.
//
//   deno run -A scripts/render-parse-origins.ts [--seed S] [--jobs N] [--report FILE] [--check]
//
// It builds a probe compiler from a scratch copy of compiler/: the first argument of every site
// `render-parse-census.vl -- --sites` lists is wrapped so the probe records each distinct string
// the site receives while `emitProgram` runs, and every `mkTypeRef` the parser makes records its
// spelling as source text. The probe checks the sweep's population (`sweep.vl -- list`), then each
// string is graded:
//   synthesized  holds `#`, `$` or `@` (an anonymous row handle, a signature key, a mangled name);
//   source       is a parser spelling, or with whitespace ignored a substring of the program's
//                own text, of std, or of a parser spelling;
//   bare         a bare identifier (`i32`, `T`), which no text test can place;
//   render       anything else: no source holds it, so a render or a substitution made it.
// A site that ever receives a render or a synthesized string is `render`; one that receives only
// source strings is `source`; the rest (bare names only, or unreached) stay unclassified.
// `--check` exits 1 when the graded file differs from the committed one.

const args = [...Deno.args];
const opt = (name: string, dflt: string) => {
  const i = args.indexOf(name);
  if (i < 0) return dflt;
  const v = args[i + 1];
  args.splice(i, 2);
  return v;
};
const flag = (name: string) => {
  const i = args.indexOf(name);
  if (i < 0) return false;
  args.splice(i, 1);
  return true;
};
const SEED = opt("--seed", "build/vl-compiler.wasm");
const JOBS = Number(opt("--jobs", "4"));
const REPORT = opt("--report", "");
const CHECK = flag("--check");
const VL = `${Deno.cwd()}/scripts/vl-host/target/release/vl`;
const ORIGINS = "scripts/render-parse-origins.txt";

const dec = new TextDecoder();
const enc = new TextEncoder();
const run = async (
  cmd: string,
  argv: string[],
  env: Record<string, string> = {},
) => {
  const r = await new Deno.Command(cmd, {
    args: argv,
    env: { VL_STD: `${Deno.cwd()}/std`, ...env },
    stdout: "piped",
    stderr: "piped",
  }).output();
  return { code: r.code, out: dec.decode(r.stdout), err: dec.decode(r.stderr) };
};
const die = (msg: string): never => {
  console.error(`render-parse-origins: ${msg}`);
  Deno.exit(2);
};

type Site = { key: string; file: string; line: number; col: number };

// The census's parse sites, keyed as the census keys them.
const sitesOf = async (): Promise<Site[]> => {
  const r = await run(VL, [
    "run",
    "scripts/render-parse-census.vl",
    "--",
    "--sites",
  ]);
  if (r.code !== 0) die(`census --sites failed: ${r.err}`);
  return r.out.split("\n").filter((l) => l).map((l) => {
    const f = l.split("\t");
    return {
      key: f.slice(0, 4).join("\t"),
      file: f[0],
      line: Number(f[4]),
      col: Number(f[5]),
    };
  });
};

// The byte offset just past the first argument of the call whose `(` is at `open`.
const firstArgEnd = (b: Uint8Array, open: number): number => {
  let depth = 0;
  let i = open + 1;
  while (i < b.length) {
    const c = b[i];
    if (c === 0x22 || c === 0x27) {
      i++;
      while (i < b.length && b[i] !== c) i += b[i] === 0x5c ? 2 : 1;
    } else if (c === 0x28 || c === 0x5b || c === 0x7b) {
      depth++;
    } else if (c === 0x29 || c === 0x5d || c === 0x7d) {
      if (depth === 0) return i;
      depth--;
    } else if (c === 0x2c && depth === 0) {
      return i;
    }
    i++;
  }
  return die("unbalanced call");
};

type Insert = { at: number; text: string; order: number };

const applyInserts = (b: Uint8Array, ins: Insert[]): string => {
  ins.sort((x, y) => y.at - x.at || x.order - y.order);
  let s = dec.decode(b);
  // Offsets are bytes; splice on bytes to stay exact on non-ASCII lines.
  let bytes = b;
  for (const x of ins) {
    const t = enc.encode(x.text);
    const nb = new Uint8Array(bytes.length + t.length);
    nb.set(bytes.subarray(0, x.at), 0);
    nb.set(t, x.at);
    nb.set(bytes.subarray(x.at), x.at + t.length);
    bytes = nb;
  }
  s = dec.decode(bytes);
  return s;
};

// Wraps the first argument of `call(` at byte `at` (the callee's first byte) in `pre` … `)`.
const wrapFirstArg = (
  b: Uint8Array,
  at: number,
  pre: string,
  ins: Insert[],
) => {
  let open = at;
  while (open < b.length && b[open] !== 0x28) open++;
  const end = firstArgEnd(b, open);
  ins.push({ at: open + 1, text: pre, order: 1 }, {
    at: end,
    text: ")",
    order: 0,
  });
};

const lineStarts = (b: Uint8Array): number[] => {
  const s = [0];
  for (let i = 0; i < b.length; i++) if (b[i] === 0x0a) s.push(i + 1);
  return s;
};

const PROBE = `import { i32ToStr } from "./ast"

let hpOn = false
let hpSrc: {[string]: i32} = Map()
let hpNew: string[] = []
let hpSeen: {[string]: i32} = Map()
let hpOut: string[] = []

export function hpSrcNote(s: string): string {
  if (hpSrc[s] ?? 0) == 0 { hpNew.push(s) }
  // Reset per program at hpEnd: a program's own parser spellings, never a neighbour's.
  hpSrc[s] = 1
  s
}

export function hpS(k: i32, v: string): string {
  if hpOn {
    const key = i32ToStr(k) + "\\u{1}" + v
    if (hpSeen[key] ?? 0) == 0 {
      hpSeen[key] = 1
      const ex = if (hpSrc[v] ?? 0) == 1 { "1" } else { "0" }
      if hpOut.length < 4000 {
        hpOut.push(i32ToStr(k) + "\\u{2}" + ex + "\\u{2}" + (if v.length > 200 { v.slice(0, 200) } else { v }))
      }
    }
  }
  v
}

export function hpBegin(): i32 {
  hpOn = true
  hpSeen = Map()
  hpOut = []
  0
}

export function hpEnd(): string {
  hpOn = false
  let m = ""
  for x in hpOut { m = m + "\\u{3}" + x }
  for x in hpNew { m = m + "\\u{4}" + x }
  hpNew = []
  hpSrc = Map()
  m
}
`;

const EMIT_HOOK_OLD = `  const d0 = T.diags.length
  const rc = emitProgramRun(rootIx)
`;
const EMIT_HOOK_NEW = `  const d0 = T.diags.length
  hpBegin()
  const rc0 = emitProgramRun(rootIx)
  const hm = hpEnd()
  let rc = rc0
  if hm != "" {
    emitFail("HPROBE" + hm)
    rc = -1
  }
`;

// A scratch compiler/ with every site's first argument and every parser `mkTypeRef` recorded.
const buildProbe = async (sites: Site[], dir: string): Promise<string> => {
  await Deno.mkdir(`${dir}/compiler`, { recursive: true });
  const byFile = new Map<string, number[]>();
  sites.forEach((s, k) =>
    byFile.set(s.file, [...(byFile.get(s.file) ?? []), k])
  );
  for (const e of Deno.readDirSync("compiler")) {
    if (!e.isFile) continue;
    const rel = `compiler/${e.name}`;
    let b = Deno.readFileSync(rel);
    const ins: Insert[] = [];
    const ks = byFile.get(rel) ?? [];
    if (ks.length > 0) {
      const ls = lineStarts(b);
      for (const k of ks) {
        wrapFirstArg(
          b,
          ls[sites[k].line - 1] + sites[k].col - 1,
          `hpS(${k}, `,
          ins,
        );
      }
    }
    if (e.name === "parser.vl") {
      const text = dec.decode(b);
      for (const m of text.matchAll(/(?<![A-Za-z0-9_.])mkTypeRef\(/g)) {
        wrapFirstArg(
          b,
          enc.encode(text.slice(0, m.index!)).length,
          "hpSrcNote(",
          ins,
        );
      }
    }
    let out = ins.length > 0 ? applyInserts(b, ins) : dec.decode(b);
    if (ins.length > 0) {
      out = `import { hpS, hpSrcNote } from "./hprobe"\n${out}`;
    }
    if (e.name === "emit_sections.vl") {
      if (!out.includes(EMIT_HOOK_OLD)) {
        die("emitProgram's hook point moved; update EMIT_HOOK_OLD");
      }
      out = `import { hpBegin, hpEnd } from "./hprobe"\n${
        out.replace(EMIT_HOOK_OLD, EMIT_HOOK_NEW)
      }`;
    }
    b = enc.encode(out);
    Deno.writeFileSync(`${dir}/${rel}`, b);
  }
  Deno.writeTextFileSync(`${dir}/compiler/hprobe.vl`, PROBE);
  const wasm = `${dir}/probe.wasm`;
  const r = await run(VL, [
    "build",
    `${dir}/compiler/entry.vl`,
    "--compiler",
    SEED,
    "-o",
    wasm,
  ]);
  if (r.code !== 0) die(`probe build failed:\n${r.out}${r.err}`);
  return wasm;
};

const nos = (t: string) => t.replace(/\s+/g, "");
const IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/;

const main = async () => {
  const sites = await sitesOf();
  const tmp = await Deno.makeTempDir({ prefix: "vl_rp_origins_" });
  try {
    const wasm = await buildProbe(sites, tmp);
    const listed = await run(VL, ["run", "scripts/sweep.vl", "--", "list"]);
    if (listed.code !== 0) die(`sweep list failed: ${listed.err}`);
    const files = listed.out.split("\n").filter((l) => l).map((l) =>
      l.split("\t")[1]
    );
    let std = "";
    for (const e of Deno.readDirSync("std")) {
      if (e.name.endsWith(".vl")) {
        std += Deno.readTextFileSync(`std/${e.name}`);
      }
    }
    std = nos(std);
    // per site: class -> programs, and examples
    const per = sites.map(() => new Map<string, number>());
    const ex = sites.map(() => new Map<string, string[]>());
    // Fixed-size batches in file order, so a program's neighbours, and with them any parser
    // text a failed predecessor left behind, do not depend on --jobs.
    const BATCH = 400;
    const batches: string[][] = [];
    for (let i = 0; i < files.length; i += BATCH) {
      batches.push(files.slice(i, i + BATCH));
    }
    let next = 0;
    const work = async () => {
      while (next < batches.length) {
        const part = batches[next++];
        const r = await run(VL, [
          "check",
          "--batch",
          "--json",
          "--codegen",
          "--compiler",
          wasm,
          ...part,
        ]);
        for (const line of r.out.split("\n")) {
          if (!line.startsWith("{")) continue;
          let rec: { file: string; diagnostics?: { message: string }[] };
          try {
            rec = JSON.parse(line);
          } catch {
            continue;
          }
          for (const d of rec.diagnostics ?? []) {
            if (!d.message.startsWith("HPROBE")) continue;
            const [body, ...news] = d.message.split("\x04");
            const parsed = news.map(nos).join("\x00");
            let src = "";
            try {
              src = nos(Deno.readTextFileSync(rec.file));
            } catch { /* a module path that is not a file */ }
            const seen = new Map<number, Set<string>>();
            for (const item of body.split("\x03").slice(1)) {
              const [ks, exact, v] = item.split("\x02");
              const k = Number(ks);
              let c: string;
              if (v === "") c = "empty";
              else if (/[#$@]/.test(v)) c = "synthesized";
              else if (IDENT.test(v)) c = "bare";
              else if (
                exact === "1" || src.includes(nos(v)) || std.includes(nos(v)) ||
                parsed.includes(nos(v))
              ) {
                c = "source";
              } else c = "render";
              if (!seen.has(k)) seen.set(k, new Set());
              seen.get(k)!.add(c);
              const xs = ex[k].get(c) ?? [];
              if (xs.length < 3 && !xs.includes(v)) ex[k].set(c, [...xs, v]);
            }
            for (const [k, cs] of seen) {
              for (const c of cs) per[k].set(c, (per[k].get(c) ?? 0) + 1);
            }
          }
        }
      }
    };
    await Promise.all(Array.from({ length: JOBS }, work));
    const grade = (k: number) => {
      const p = per[k];
      if (p.get("render") || p.get("synthesized")) return "render";
      if (p.get("source")) return "source";
      return "";
    };
    const lines = sites.map((s, k) => [grade(k), s.key]).filter(([g]) => g).map(
      ([g, key]) => `${g}\t${key}`,
    ).sort();
    const text =
      `# Generated by scripts/render-parse-origins.ts; read by scripts/render-parse-census.vl.\n` +
      `# <origin>\\t<file>\\t<fn>\\t<callee>\\t<ordinal>; an ungraded site is absent.\n` +
      lines.join("\n") + "\n";
    const tally = new Map<string, number>();
    sites.forEach((_, k) =>
      tally.set(
        grade(k) || "unclassified",
        (tally.get(grade(k) || "unclassified") ?? 0) + 1,
      )
    );
    console.log(
      `render-parse-origins: ${sites.length} sites — ${
        [...tally].map(([c, n]) => `${n} ${c}`).join(", ")
      }`,
    );
    if (REPORT) {
      const rows = sites.map((s, k) =>
        `${grade(k) || "unclassified"}\t${s.key}\t${s.line}\t${
          JSON.stringify(Object.fromEntries(per[k]))
        }\t${JSON.stringify(Object.fromEntries(ex[k]))}`
      );
      Deno.writeTextFileSync(REPORT, rows.join("\n") + "\n");
    }
    if (CHECK) {
      let old = "";
      try {
        old = Deno.readTextFileSync(ORIGINS);
      } catch { /* absent */ }
      if (old !== text) {
        console.log(
          `render-parse-origins: ${ORIGINS} is stale; rerun without --check`,
        );
        Deno.exit(1);
      }
    } else {
      Deno.writeTextFileSync(ORIGINS, text);
    }
  } finally {
    await Deno.remove(tmp, { recursive: true });
  }
};

await main();
