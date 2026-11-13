// Grades each type-string parse site the render-parse census counts by where its input spelling
// came from, and writes scripts/render-parse-origins.txt, which the census reads.
//
//   deno run -A scripts/render-parse-origins.ts [--seed S] [--jobs N] [--report FILE] [--check]
//
// It builds a probe compiler from a scratch copy of compiler/: the first argument of every site
// `render-parse-census.vl -- --sites --all-files` lists is wrapped so the probe records each distinct string
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
// The origins file grades the census's own (emitter) sites. The report, by default
// docs/internals/render-parse-sites.md, has one row per reached site of any compiler file: its
// origin, the expression that produced its argument, the program count and a witness program.
// `--check` exits 1 when a live site's grade differs from the committed file's; a committed row
// whose site no longer exists is ignored.

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
const REPORT = opt("--report", "docs/internals/render-parse-sites.md");
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

type Site = {
  key: string;
  file: string;
  line: number;
  col: number;
  inScope: boolean;
  producer: string;
};

const SCOPE = /^compiler\/(emit_[^/]*|wasmEmit|check_emit_queries)\.vl$/;

// The census's parse sites, keyed as the census keys them.
const sitesOf = async (): Promise<Site[]> => {
  const r = await run(VL, [
    "run",
    "scripts/render-parse-census.vl",
    "--",
    "--sites",
    "--all-files",
  ]);
  if (r.code !== 0) die(`census --sites failed: ${r.err}`);
  return r.out.split("\n").filter((l) => l).map((l) => {
    const f = l.split("\t");
    return {
      key: f.slice(0, 4).join("\t"),
      file: f[0],
      line: Number(f[4]),
      col: Number(f[5]),
      inScope: SCOPE.test(f[0]),
      producer: "",
    };
  });
};

// The census's `ty-render` calls, keyed as the census keys them.
const renderSitesOf = async (): Promise<Site[]> => {
  const r = await run(VL, [
    "run",
    "scripts/render-parse-census.vl",
    "--",
    "--render-sites",
  ]);
  if (r.code !== 0) die(`census --render-sites failed: ${r.err}`);
  return r.out.split("\n").filter((l) => l).map((l) => {
    const f = l.split("\t");
    return {
      key: f.slice(0, 4).join("\t"),
      file: f[0],
      line: Number(f[4]),
      col: Number(f[5]),
      inScope: true,
      producer: "",
    };
  });
};

// The byte offset of the `)` closing the call whose `(` is at `open`.
const callEnd = (b: Uint8Array, open: number): number => {
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
    }
    i++;
  }
  return die("unbalanced call");
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
// Returns the argument's source text.
const wrapFirstArg = (
  b: Uint8Array,
  at: number,
  pre: string,
  ins: Insert[],
): string => {
  let open = at;
  while (open < b.length && b[open] !== 0x28) open++;
  const end = firstArgEnd(b, open);
  ins.push({ at: open + 1, text: pre, order: 1 }, {
    at: end,
    text: ")",
    order: 0,
  });
  return dec.decode(b.subarray(open + 1, end)).replace(/\s+/g, " ").trim();
};

// The producer of a site's argument: the expression itself, or for a bare name the
// initializer of its nearest `const`/`let` above the call, else that it is a parameter.
const producerOf = (text: string, callAt: number, arg: string): string => {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(arg)) return arg;
  const before = text.slice(0, callAt);
  const fnAt = before.lastIndexOf("\nfunction ") >= 0 ||
      before.lastIndexOf("\nexport function ") >= 0
    ? Math.max(
      before.lastIndexOf("\nfunction "),
      before.lastIndexOf("\nexport function "),
    )
    : 0;
  const body = before.slice(fnAt);
  const re = new RegExp(
    `(?:const|let)\\s+${arg}\\s*(?::[^=\\n]+)?=\\s*([^\\n]+)`,
    "g",
  );
  let last = "";
  for (const m of body.matchAll(re)) last = m[1].trim();
  if (last) return `${arg} = ${last}`;
  return `${arg} (a parameter)`;
};

// What the value spanning text[from, to) flows into, one hop: `kind: detail`. Kinds: key (an index
// or a get/set/has/delete argument), push, compare, scan (the string itself indexed or measured),
// arg, return (a return or a block's tail value), discarded, concat, store, bind, other.
const contextOf = (text: string, from: number, to: number): string => {
  const before = text.slice(Math.max(0, from - 160), from).replace(/\s+$/, "");
  const after = text.slice(to, to + 160).replace(/^\s+/, "");
  const line = (t: string) => t.split("\n")[0].trim().slice(0, 60);
  if (/^(==|!=)/.test(after) || /(==|!=)$/.test(before)) {
    return `compare: ${line(after.replace(/^(==|!=)\s*/, "")) || "…"}`;
  }
  if (/^\+(?!=)/.test(after) || /[^+]\+$/.test(before)) return "concat";
  if (
    /^(\[|\.length\b|\.slice\(|\.indexOf\(|\.startsWith\(|\.endsWith\()/.test(
      after,
    )
  ) {
    return `scan: ${line(after)}`;
  }
  if (/(^|[^A-Za-z0-9_])return$/.test(before)) return "return";
  const bind = before.match(
    /(?:const|let)\s+([A-Za-z_][A-Za-z0-9_]*)\s*(?::[^=]+)?=$/,
  );
  if (bind) return `bind: ${bind[1]}`;
  const store = before.match(/([A-Za-z_][A-Za-z0-9_.]*(?:\[[^\]]*\])?)\s*=$/);
  if (store && !/[=!<>]=$/.test(before)) return `store: ${store[1]}`;
  // The innermost unclosed `(` or `[` before the value.
  let depth = 0;
  for (let i = from - 1; i >= Math.max(0, from - 4000); i--) {
    const c = text[i];
    if (c === ")" || c === "]" || c === "}") depth++;
    else if (c === "(" || c === "[" || c === "{") {
      if (depth > 0) {
        depth--;
        continue;
      }
      if (c === "{") break;
      const head = text.slice(Math.max(0, i - 80), i).match(
        /([A-Za-z_][A-Za-z0-9_.]*)\s*$/,
      );
      const callee = head ? head[1] : "";
      if (c === "[") return `key: ${callee}[…]`;
      if (/\.(get|set|has|delete)$/.test(callee)) return `key: ${callee}(…)`;
      if (/(^|\.)push$|Push$/.test(callee)) return `push: ${callee}(…)`;
      // The argument's position: depth-0 commas between the `(` and the value.
      let pos = 0;
      let d2 = 0;
      for (let j = i + 1; j < from; j++) {
        const cj = text[j];
        if (cj === "(" || cj === "[" || cj === "{") d2++;
        else if (cj === ")" || cj === "]" || cj === "}") d2--;
        else if (cj === "," && d2 === 0) pos++;
      }
      return `arg: ${callee || "(group)"}(…)#${pos}`;
    }
  }
  // A value that starts its own statement: the block's tail value when the block ends next, else
  // a value nothing reads.
  const stmtStart = /(^|[{};]|=>)$/.test(before) ||
    text.slice(Math.max(0, from - 160), from).search(/\n[ \t]*$/) >= 0;
  if (stmtStart) {
    if (/^(}|[A-Za-z_][A-Za-z0-9_]*\s*(\|[^=]*)?=>)/.test(after)) {
      return "return";
    }
    return "discarded";
  }
  return `other: ${line(before.split("\n").pop() ?? "")}`;
};

// Every compiler function's parameter names and body, for the keyed-through-a-callee test.
const FNS = new Map<string, { params: string[]; body: string }>();
const loadFns = () => {
  for (const e of Deno.readDirSync("compiler")) {
    if (!e.name.endsWith(".vl")) continue;
    const t = Deno.readTextFileSync(`compiler/${e.name}`);
    const re = /\n(?:export )?function ([A-Za-z_][A-Za-z0-9_]*)\(([^)]*)\)/g;
    const ms = [...t.matchAll(re)];
    ms.forEach((m, j) => {
      const end = j + 1 < ms.length ? ms[j + 1].index! : t.length;
      const params = m[2].split(",").map((x) => x.split(":")[0].trim())
        .filter((x) => x);
      FNS.set(m[1], { params, body: t.slice(m.index!, end) });
    });
  }
};

// Whether the callee keys a table with parameter `pos` (an index, or a get/set/has/delete argument)
// or pushes it into a column, following the parameter into the callees it is passed to, four deep.
const keyedVia = (callee: string, pos: number, depth = 4): string => {
  const f = FNS.get(callee.split(".").pop() ?? "");
  if (!f || pos >= f.params.length || depth <= 0) return "";
  const p = f.params[pos];
  let found = "";
  const re = new RegExp(`(?<![A-Za-z0-9_.])${p}(?![A-Za-z0-9_])`, "g");
  for (const m of f.body.matchAll(re)) {
    const at = m.index!;
    if (at < f.body.indexOf("{")) continue;
    const c = contextOf(f.body, at, at + p.length);
    if (c.startsWith("key: ")) return "key";
    if (c.startsWith("push: ")) found = "push";
    const a = c.match(/^arg: ([A-Za-z_][A-Za-z0-9_.]*)\(…\)#(\d+)$/);
    if (a && a[1] !== callee) {
      const v = keyedVia(a[1], Number(a[2]), depth - 1);
      if (v === "key") return "key";
      if (v === "push") found = "push";
    }
  }
  return found;
};

// A render's consumer: its context, or for a value bound to a name, each use's context in the
// rest of the function (up to three distinct).
const consumerOf = (text: string, from: number, to: number): string => {
  const c = contextOf(text, from, to);
  if (!c.startsWith("bind: ")) return c;
  const name = c.slice(6);
  const rest = text.slice(to);
  const fnEnd = rest.search(/\n(?:export )?function /);
  const body = fnEnd >= 0 ? rest.slice(0, fnEnd) : rest;
  const uses = new Set<string>();
  for (
    const m of body.matchAll(
      new RegExp(`(?<![A-Za-z0-9_.])${name}(?![A-Za-z0-9_])`, "g"),
    )
  ) {
    const at = to + m.index!;
    // A reassignment of the name is not a read of the render.
    if (/^\s*=(?!=)/.test(text.slice(at + name.length, at + name.length + 4))) {
      continue;
    }
    uses.add(contextOf(text, at, at + name.length));
    if (uses.size >= 3) break;
  }
  return `${name} → ${[...uses].join("; ") || "unused"}`;
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

let hpRSeen: {[string]: i32} = Map()
let hpROut: string[] = []

export function hpR(k: i32, v: string): string {
  if hpOn {
    const key = i32ToStr(k)
    if (hpRSeen[key] ?? 0) == 0 {
      hpRSeen[key] = 1
      hpROut.push(key + "\\u{2}" + (if v.length > 120 { v.slice(0, 120) } else { v }))
    }
  }
  v
}

export function hpBegin(): i32 {
  hpOn = true
  hpSeen = Map()
  hpOut = []
  hpRSeen = Map()
  hpROut = []
  0
}

export function hpEnd(): string {
  hpOn = false
  let m = ""
  for x in hpOut { m = m + "\\u{3}" + x }
  for x in hpROut { m = m + "\\u{5}" + x }
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
    // A refusal has already latched the first failure; the probe's report replaces it, so a
    // site reached only by a refusing program still counts.
    emitFailed = false
    emitFail("HPROBE" + hm)
    rc = -1
  }
`;

// A scratch compiler/ with every site's first argument and every parser `mkTypeRef` recorded.
const buildProbe = async (
  sites: Site[],
  rsites: Site[],
  dir: string,
): Promise<string> => {
  await Deno.mkdir(`${dir}/compiler`, { recursive: true });
  const byFile = new Map<string, number[]>();
  sites.forEach((s, k) =>
    byFile.set(s.file, [...(byFile.get(s.file) ?? []), k])
  );
  const rByFile = new Map<string, number[]>();
  rsites.forEach((s, k) =>
    rByFile.set(s.file, [...(rByFile.get(s.file) ?? []), k])
  );
  for (const e of Deno.readDirSync("compiler")) {
    if (!e.isFile) continue;
    const rel = `compiler/${e.name}`;
    let b = Deno.readFileSync(rel);
    const ins: Insert[] = [];
    const ks = byFile.get(rel) ?? [];
    if (ks.length > 0) {
      const ls = lineStarts(b);
      const text = dec.decode(b);
      for (const k of ks) {
        const at = ls[sites[k].line - 1] + sites[k].col - 1;
        const arg = wrapFirstArg(b, at, `hpS(${k}, `, ins);
        sites[k].producer = producerOf(
          text,
          dec.decode(b.subarray(0, at)).length,
          arg,
        );
      }
    }
    const rks = rByFile.get(rel) ?? [];
    if (rks.length > 0) {
      const ls = lineStarts(b);
      const text = dec.decode(b);
      for (const k of rks) {
        const at = ls[rsites[k].line - 1] + rsites[k].col - 1;
        let open = at;
        while (open < b.length && b[open] !== 0x28) open++;
        const end = callEnd(b, open);
        // Inside a parse site's wrap at the same byte: opens after `hpS(`, closes before its `)`.
        ins.push({ at, text: `hpR(${k}, `, order: 0.5 }, {
          at: end + 1,
          text: ")",
          order: 0.5,
        });
        rsites[k].producer = consumerOf(
          text,
          dec.decode(b.subarray(0, at)).length,
          dec.decode(b.subarray(0, end + 1)).length,
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
      out = `import { hpR, hpS, hpSrcNote } from "./hprobe"\n${out}`;
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

// A program's own text with every module it imports by a relative path, whitespace removed.
const programText = (file: string): string => {
  const seen = new Set<string>();
  const todo = [file];
  let out = "";
  while (todo.length > 0) {
    const f = todo.pop()!;
    if (seen.has(f)) continue;
    seen.add(f);
    let t = "";
    try {
      t = Deno.readTextFileSync(f);
    } catch {
      continue;
    }
    out += "\x00" + nos(t);
    const dir = f.includes("/") ? f.slice(0, f.lastIndexOf("/")) : ".";
    for (const m of t.matchAll(/from\s+"(\.{1,2}\/[^"]+)"/g)) {
      const rel = m[1].endsWith(".vl") ? m[1] : `${m[1]}.vl`;
      const parts = `${dir}/${rel}`.split("/");
      const norm: string[] = [];
      for (const x of parts) {
        if (x === "..") norm.pop();
        else if (x !== ".") norm.push(x);
      }
      todo.push(norm.join("/"));
    }
  }
  return out;
};
const IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/;

const main = async () => {
  const sites = await sitesOf();
  const rsites = await renderSitesOf();
  loadFns();
  const tmp = await Deno.makeTempDir({ prefix: "vl_rp_origins_" });
  try {
    const wasm = await buildProbe(sites, rsites, tmp);
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
    const witness = sites.map(() => new Map<string, string>());
    const rProgs = rsites.map(() => 0);
    const rWitness = rsites.map(() => ["", ""]);
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
            const [both, ...news] = d.message.split("\x04");
            const [body, ...renders] = both.split("\x05");
            for (const item of renders) {
              const [ks, v] = item.split("\x02");
              const k = Number(ks);
              rProgs[k]++;
              if (rWitness[k][0] === "") rWitness[k] = [rec.file, v ?? ""];
            }
            const parsed = news.map(nos).join("\x00");
            const src = programText(rec.file);
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
              if (!witness[k].has(c)) witness[k].set(c, rec.file);
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
    const lines = sites.map((s, k) => [s.inScope ? grade(k) : "", s.key])
      .filter(([g]) => g).map(
        ([g, key]) => `${g}\t${key}`,
      ).sort();
    const seedHash = Array.from(
      new Uint8Array(
        await crypto.subtle.digest("SHA-256", Deno.readFileSync(SEED)),
      ),
    ).slice(0, 8).map((x) => x.toString(16).padStart(2, "0")).join("");
    const today = new Date().toISOString().slice(0, 10);
    const text =
      `# Generated by scripts/render-parse-origins.ts; read by scripts/render-parse-census.vl.\n` +
      `# Probed ${today} on seed ${seedHash} over ${files.length} programs (sweep.vl -- list).\n` +
      `# <origin>\\t<file>\\t<fn>\\t<callee>\\t<ordinal>; an ungraded site is absent.\n` +
      lines.join("\n") + "\n";
    const tally = new Map<string, number>();
    const scoped = sites.map((s, k) => [s, k] as const).filter(([s]) =>
      s.inScope
    );
    scoped.forEach(([, k]) =>
      tally.set(
        grade(k) || "unclassified",
        (tally.get(grade(k) || "unclassified") ?? 0) + 1,
      )
    );
    console.log(
      `render-parse-origins: ${scoped.length} census sites — ${
        [...tally].map(([c, n]) => `${n} ${c}`).join(", ")
      }`,
    );
    if (REPORT && !CHECK) {
      const cls = (k: number) => {
        const p = per[k];
        if (p.get("render") || p.get("synthesized")) {
          return p.get("synthesized") && !p.get("render")
            ? "(b) synthesized"
            : p.get("synthesized")
            ? "(a)+(b) render and synthesized"
            : "(a) render";
        }
        if (p.get("source")) return "(c) source";
        if (p.get("bare")) return "unclassified: bare names";
        return "unclassified: empty only";
      };
      const pick = (k: number) => {
        for (const c of ["render", "synthesized", "source", "bare", "empty"]) {
          if (witness[k].has(c)) {
            return [witness[k].get(c)!, (ex[k].get(c) ?? [""])[0]];
          }
        }
        return ["", ""];
      };
      const cell = (t: string) => t.replace(/\|/g, "\\|").replace(/`/g, "'");
      const reached = sites.map((s, k) => [s, k] as const).filter(([, k]) =>
        per[k].size > 0
      );
      const row = ([s, k]: readonly [Site, number]) => {
        const [w, e] = pick(k);
        const n = (c: string) => per[k].get(c) ?? 0;
        const c = cls(k);
        const progs = c.startsWith("(a)+(b)")
          ? `${n("render")} render, ${n("synthesized")} synthesized`
          : c.startsWith("(a)")
          ? `${n("render")}`
          : c.startsWith("(b)")
          ? `${n("synthesized")}`
          : c.startsWith("(c)")
          ? `${n("source")}`
          : `${n("bare") || n("empty")}`;
        const fn = s.key.split("\t")[1];
        const callee = s.key.split("\t")[2];
        return `| ${
          s.file.replace("compiler/", "")
        }:${s.line} | ${fn} | ${callee} | ${cls(k)} | \`${
          cell(s.producer).slice(0, 80)
        }\` | ${progs} | ${w} | \`${cell(e).slice(0, 60)}\` |`;
      };
      const head =
        "| site | function | parser | origin | producer of the argument | programs | witness | example |\n" +
        "| --- | --- | --- | --- | --- | --- | --- | --- |";
      const unreached = sites.filter((s, k) => s.inScope && per[k].size === 0);
      const doc = `# Render-parse sites by input origin\n\n` +
        `Generated by \`scripts/render-parse-origins.ts\` (${today}, seed ${seedHash}, ${files.length} programs).\n` +
        `One row per type-string parse site reached during emit. \`programs\` counts the programs in which\n` +
        `the site received a string of its origin class; the witness and example are one of them. The producer is the call's\n` +
        `argument, or a bare name's nearest initializer above the call, found by text.\n\n` +
        `## The census's sites (emitter files)\n\n${head}\n` +
        reached.filter(([s]) => s.inScope).map(row).join("\n") +
        `\n\n## Checker-file sites reached during emit\n\n${head}\n` +
        reached.filter(([s]) => !s.inScope).map(row).join("\n") +
        `\n\n## Renders a later decision reads (\`ty-render\`), by consumer\n\n` +
        `One row per render call. The consumer is what the rendered string flows into, one hop, read\n` +
        `from the source: an index or \`get\`/\`set\`/\`has\` argument (key), a column push, a comparison, a\n` +
        `call argument, a return, a concatenation or a store; a string bound to a name lists that name's\n` +
        `uses. \`keyed\` is yes for a key, push for a column push, compare for a comparison. \`programs\`\n` +
        `counts the programs that reached the call during emit.\n\n` +
        "| site | function | renderer | consumer | keyed | programs | witness | example |\n" +
        "| --- | --- | --- | --- | --- | --- | --- | --- |\n" +
        rsites.map((s, k) => {
          const c = s.producer;
          const via = [
            ...c.matchAll(/arg: ([A-Za-z_][A-Za-z0-9_.]*)\(…\)#(\d+)/g),
          ]
            .map((m) => [m[1], keyedVia(m[1], Number(m[2]))] as const)
            .filter(([, v]) => v);
          const keyed = /key: /.test(c)
            ? "yes"
            : via.some(([, v]) => v === "key")
            ? `yes, via ${
              via.filter(([, v]) => v === "key").map(([f]) => f).join(", ")
            }`
            : /push: /.test(c) || via.length > 0
            ? "push"
            : /compare: /.test(c)
            ? "compare"
            : "no";
          return `| ${s.file.replace("compiler/", "")}:${s.line} | ${
            s.key.split("\t")[1]
          } | ${s.key.split("\t")[2]} | \`${
            cell(c.replace(/#\d+/g, "")).slice(0, 110)
          }\` | ${keyed} | ${rProgs[k]} | ${rWitness[k][0]} | \`${
            cell(rWitness[k][1]).slice(0, 50)
          }\` |`;
        }).join("\n") +
        `\n\n## The census's sites no program reaches\n\n` +
        unreached.map((s) =>
          `- ${s.file.replace("compiler/", "")}:${s.line} ${
            s.key.split("\t")[1]
          } → ${s.key.split("\t")[2]}`
        )
          .join("\n") +
        "\n";
      Deno.writeTextFileSync(REPORT, doc);
    }
    if (CHECK) {
      let old = "";
      try {
        old = Deno.readTextFileSync(ORIGINS);
      } catch { /* absent */ }
      // A committed row whose site no longer exists is a deleted parse: a fall, never a failure.
      const live = new Set(sites.filter((s) => s.inScope).map((s) => s.key));
      const rows = (t: string) =>
        t.split("\n").filter((l) => l && !l.startsWith("#")).filter((l) =>
          live.has(l.split("\t").slice(1).join("\t"))
        ).sort().join("\n");
      if (rows(old) !== rows(text)) {
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
