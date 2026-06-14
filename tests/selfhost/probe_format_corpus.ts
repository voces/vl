// PROBE (not a durable test): drive the self-hosted formatter `compiler/format.vl`
// over the WHOLE corpus (tests/cases/**/*.vl) and report, per file, whether the
// three formatter guarantees hold — idempotent, AST round-trip (via the TS
// `checkOnly` oracle, the same one `format_test.ts` uses), comment-preserving.
//
// Output is a categorized ledger so I can separate:
//   - parser.vl gaps      (file doesn't parse to a faithful AST — out of scope)
//   - formatter divergences (compound assign, verbatim fallback — the work)
//
// Run: deno run -A tests/selfhost/probe_format_corpus.ts [--max N] [--only substr]

import { checkOnly } from "../../compiler/compile.ts";
import { compileProgramCached } from "../_selfhost_cache.ts";

const compilerUrl = (name: string) =>
  new URL(`../../compiler/${name}`, import.meta.url).pathname;
const LEXER = compilerUrl("lexer.vl");
const AST = compilerUrl("ast.vl");
const PARSER = compilerUrl("parser.vl");
const TYPECHECK = compilerUrl("typecheck.vl");
const FORMAT = compilerUrl("format.vl");
const DRIVER = compilerUrl("__format_corpus_driver__.vl");

// ── corpus walk ────────────────────────────────────────────────────────────
const CASES_DIR = new URL("../cases/", import.meta.url);
const walk = async function* (dir: URL): AsyncGenerator<URL> {
  for await (const entry of Deno.readDir(dir)) {
    const child = new URL(entry.name + (entry.isDirectory ? "/" : ""), dir);
    if (entry.isDirectory) yield* walk(child);
    else if (entry.name.endsWith(".vl")) yield child;
  }
};
const corpusFiles = async (): Promise<URL[]> => {
  const files: URL[] = [];
  for await (const f of walk(CASES_DIR)) files.push(f);
  files.sort((a, b) => a.href.localeCompare(b.href));
  return files;
};

// ── AST normalization (copied from format_test.ts) ───────────────────────────
const DROP_KEYS = new Set([
  "scope", "variableType", "functionType", "valueType",
  "paramaterType", "returnType", "checkType",
]);
// deno-lint-ignore no-explicit-any
const normalize = (node: any): any => {
  if (Array.isArray(node)) return node.map(normalize);
  if (node && typeof node === "object") {
    // deno-lint-ignore no-explicit-any
    const out: any = {};
    for (const key of Object.keys(node)) {
      if (DROP_KEYS.has(key)) continue;
      out[key] = normalize(node[key]);
    }
    return out;
  }
  return node;
};
const astShape = (source: string): string =>
  JSON.stringify(normalize(checkOnly(source).ast.statements));

const SEMANTIC_PREFIXES = ["undeclared", "redeclared", "invalid assignment"];
const hasSyntaxError = (source: string): boolean =>
  checkOnly(source).diagnostics.some((d) => {
    if (d.severity !== "error") return false;
    if (!d.message.startsWith("Syntax error:")) return false;
    const m = d.message.replace(/^Syntax error:\s*/, "");
    return !SEMANTIC_PREFIXES.some((p) => m.startsWith(p));
  });

// ── trap-capturing wasm runner (returns partial logs even on trap) ───────────
const runWasmCapture = async (
  wasm: Uint8Array,
): Promise<{ logs: string[]; trapped: boolean; error?: string }> => {
  const logs: string[] = [];
  const printChars: number[] = [];
  const memory = new WebAssembly.Memory({ initial: 1, maximum: 65536 });
  const flush = () => {
    let s = "";
    for (let i = 0; i < printChars.length; i += 8192) {
      s += String.fromCodePoint(...printChars.slice(i, i + 8192));
    }
    logs.push(s);
    printChars.length = 0;
  };
  try {
    await WebAssembly.instantiate(wasm, {
      imports: {
        memory,
        __log_string__: (o: number, l: number) =>
          logs.push(new TextDecoder().decode(new Uint8Array(memory.buffer, o, l))),
        __log__: () => {},
        __print_i32__: (v: number) => logs.push(String(v)),
        __print_i64__: (v: bigint) => logs.push(v.toString()),
        __print_f32__: (v: number) => logs.push(String(v)),
        __print_f64__: (v: number) => logs.push(String(v)),
        __print_bool__: (v: number) => logs.push(v ? "true" : "false"),
        __print_char__: (c: number) => printChars.push(c),
        __print_str_flush__: flush,
      },
    });
    return { logs, trapped: false };
  } catch (err) {
    return { logs, trapped: true, error: String(err) };
  }
};

// ── build + run the corpus driver ────────────────────────────────────────────
const driverHeader = `
import { tokenize } from "./lexer"
import { P, i32ToStr, nodeToks, declNameTok } from "./ast"
import { parseProgram } from "./parser"
import { formatProgram, fmtSetSource, fmtResetComments, fmtAddComment } from "./format"

function loadCase(src: string): i32 {
  P.toks = []
  P.nodes = []
  P.diags = []
  P.pos = 0
  nodeToks = []
  declNameTok = []
  fmtSetSource(src)
  fmtResetComments()
  let r = tokenize(src)
  let i = 0
  while i < r.tokens.length {
    let t = r.tokens[i]
    P.toks.push({ kind: t.kind, text: t.text, pos: i, start: t.start, line: t.line, col: t.col })
    i = i + 1
  }
  let c = 0
  while c < r.comments.length {
    let cm = r.comments[c]
    let tr = 0
    if cm.trailing { tr = 1 }
    fmtAddComment(cm.text, cm.start, cm.line, tr)
    c = c + 1
  }
  0
}

function fmtOnce(src: string): string {
  loadCase(src)
  let root = parseProgram()
  formatProgram(root)
}

function runCase(idx: i32, src: string): i32 {
  print("@@CASE@@\\t" + i32ToStr(idx))
  let out1 = fmtOnce(src)
  let out2 = fmtOnce(out1)
  let idem = 0
  if out1 == out2 { idem = 1 }
  print("@@IDEM@@\\t" + i32ToStr(idem))
  print("@@OUT@@")
  print(out1)
  print("@@OUT2@@")
  print(out2)
  0
}
`;

type Result = {
  file: string;
  parsedOnHost: boolean; // host (TS) sees no syntax error
  trapped: boolean;
  idempotent: boolean;
  reparses: boolean; // out1 has no NEW syntax error (host TS)
  roundTrip: boolean; // astShape(out1) == astShape(src)
  commentsKept: boolean;
  out?: string;
};

const main = async () => {
  const args = Deno.args;
  const maxIdx = args.indexOf("--max");
  const max = maxIdx >= 0 ? parseInt(args[maxIdx + 1]) : Infinity;
  const onlyIdx = args.indexOf("--only");
  const only = onlyIdx >= 0 ? args[onlyIdx + 1] : "";

  let files = await corpusFiles();
  if (only) files = files.filter((f) => f.href.includes(only));
  if (Number.isFinite(max)) files = files.slice(0, max);

  const srcs = files.map((f) => Deno.readTextFileSync(f));
  const names = files.map((f) => f.href.replace(/.*\/cases\//, "cases/"));

  // Iteratively run; on a trap, drop the culprit (last @@CASE@@) and re-run.
  const skip = new Set<number>();
  const logsByIdx = new Map<number, { idem: boolean; out: string; out2: string }>();
  for (let attempt = 0; attempt < 60; attempt++) {
    const active = srcs.map((s, i) => ({ s, i })).filter((x) => !skip.has(x.i));
    const driverBody = active
      .map((x) => `runCase(${x.i}, ${JSON.stringify(x.s)})`)
      .join("\n") + "\n";
    const sources: Record<string, string> = {
      [DRIVER]: driverHeader + driverBody,
      [LEXER]: Deno.readTextFileSync(LEXER),
      [AST]: Deno.readTextFileSync(AST),
      [PARSER]: Deno.readTextFileSync(PARSER),
      [TYPECHECK]: Deno.readTextFileSync(TYPECHECK),
      [FORMAT]: Deno.readTextFileSync(FORMAT),
    };
    const { wasm, diagnostics } = await compileProgramCached(DRIVER, sources);
    if (!wasm) {
      console.error("driver failed to compile:");
      console.error(diagnostics.filter((d) => d.severity === "error").map((d) => d.message).join("\n"));
      Deno.exit(1);
    }
    const { logs, trapped, error } = await runWasmCapture(wasm);

    // Parse logs into per-idx results.
    let lastCase = -1;
    for (let i = 0; i < logs.length; i++) {
      if (logs[i].startsWith("@@CASE@@\t")) {
        lastCase = parseInt(logs[i].slice("@@CASE@@\t".length));
        const idemLine = logs[i + 1] ?? "";
        const outMarker = logs[i + 2] ?? "";
        if (idemLine.startsWith("@@IDEM@@\t") && outMarker === "@@OUT@@") {
          const idem = idemLine.slice("@@IDEM@@\t".length) === "1";
          const out = logs[i + 3] ?? "";
          const out2 = logs[i + 5] ?? ""; // logs[i+4] is "@@OUT2@@"
          logsByIdx.set(lastCase, { idem, out, out2 });
          i += 5;
        }
      }
    }
    if (!trapped) break;
    // The trap happened during lastCase (its @@CASE@@ printed but result missing).
    if (lastCase >= 0 && !logsByIdx.has(lastCase)) {
      skip.add(lastCase);
      console.error(`trap on ${names[lastCase]} — excluding and retrying (${error?.slice(0, 80)})`);
    } else {
      // trap with no identifiable culprit — bail
      console.error("trap with no identifiable culprit:", error);
      break;
    }
  }

  // Evaluate guarantees host-side.
  const results: Result[] = [];
  for (let i = 0; i < srcs.length; i++) {
    const src = srcs[i];
    const name = names[i];
    const parsedOnHost = !hasSyntaxError(src);
    const got = logsByIdx.get(i);
    if (!got) {
      results.push({ file: name, parsedOnHost, trapped: true, idempotent: false, reparses: false, roundTrip: false, commentsKept: false });
      continue;
    }
    const out = got.out;
    let reparses = false, roundTrip = false, commentsKept = false;
    try {
      reparses = !hasSyntaxError(out);
      roundTrip = astShape(out) === astShape(src);
      const { comments } = checkOnly(src);
      commentsKept = comments.every((c) => out.includes(c.text));
    } catch (_e) { /* host checkOnly threw */ }
    results.push({ file: name, parsedOnHost, trapped: false, idempotent: got.idem, reparses, roundTrip, commentsKept, out });
  }

  // ── report ────────────────────────────────────────────────────────────────
  const parseable = results.filter((r) => r.parsedOnHost);
  const fullPass = parseable.filter((r) => !r.trapped && r.idempotent && r.reparses && r.roundTrip && r.commentsKept);
  const trapped = results.filter((r) => r.trapped);
  const notIdem = parseable.filter((r) => !r.trapped && !r.idempotent);
  const noReparse = parseable.filter((r) => !r.trapped && r.reparses === false);
  const noRound = parseable.filter((r) => !r.trapped && r.reparses && !r.roundTrip);
  const noComments = parseable.filter((r) => !r.trapped && r.reparses && r.roundTrip && !r.commentsKept);

  const got2 = (f:string)=> (logsByIdx.get(names.indexOf(f))?.out2) ?? "";
  if (args.includes("--dump")) {
    const fails = parseable.filter((r) => !r.trapped && !(r.idempotent && r.reparses && r.roundTrip && r.commentsKept));
    for (const r of fails) {
      console.log(`\n######## ${r.file}  idem=${r.idempotent} reparse=${r.reparses} round=${r.roundTrip} cmt=${r.commentsKept}`);
      console.log(`---- SRC ----\n${srcs[names.indexOf(r.file)]}`);
      console.log(`---- OUT ----\n${r.out}`);
      if (!r.idempotent) console.log(`---- OUT2 (idem diff) ----\n${got2(r.file)}`);
    }
    return;
  }
  // Root-cause classification of every failing parseable file (by source markers).
  const classify = (r: Result): string => {
    const src = srcs[names.indexOf(r.file)];
    const out = r.out ?? "";
    if (!r.reparses) return "verbatim-fallback (op-named/method-shorthand/index-trap)";
    if (/(\+\+|--)/.test(src)) return "increment (++/--) desugar";
    if (/[-+*/%]=[^=]/.test(src)) return "compound-assign desugar";
    if (/^import /m.test(src) && !/^import /m.test(out)) return "imports dropped";
    if (/else\s+if/.test(src)) return "else-if -> elseif normalization";
    return "other";
  };
  const fails = parseable.filter((r) => !r.trapped && !(r.idempotent && r.reparses && r.roundTrip && r.commentsKept));
  const byCause = new Map<string, string[]>();
  for (const r of fails) {
    const c = classify(r);
    if (!byCause.has(c)) byCause.set(c, []);
    byCause.get(c)!.push(r.file);
  }
  const list = (rs: Result[], n = 40) => rs.slice(0, n).map((r) => "    " + r.file).join("\n");
  console.log(`\n==== format.vl full-corpus probe ====`);
  console.log(`total files:            ${results.length}`);
  console.log(`host-parseable:         ${parseable.length}`);
  console.log(`FULL PASS (3 guarantees): ${fullPass.length} / ${parseable.length}`);
  console.log(`\n-- trapped (${trapped.length}) --\n${list(trapped)}`);
  console.log(`\n-- not idempotent (${notIdem.length}) --\n${list(notIdem)}`);
  console.log(`\n-- output doesn't re-parse (${noReparse.length}) --\n${list(noReparse)}`);
  console.log(`\n-- AST round-trip fails (${noRound.length}) --\n${list(noRound)}`);
  console.log(`\n-- comments lost (${noComments.length}) --\n${list(noComments)}`);
  console.log(`\n==== ROOT CAUSES (${fails.length} failing parseable files) ====`);
  for (const [cause, fs] of [...byCause.entries()].sort((a, b) => b[1].length - a[1].length)) {
    console.log(`\n[${fs.length}] ${cause}`);
    for (const f of fs) console.log(`    ${f}`);
  }
};

await main();
