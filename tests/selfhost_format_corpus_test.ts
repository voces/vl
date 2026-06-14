// Full-corpus conformance for the self-hosted formatter `compiler/format.vl`.
//
// This is the self-host sibling of `tests/format_test.ts` (which exercises the
// HOST `compiler/format.ts`): it drives `format.vl` — compiled to wasm through
// the TS front end, exactly like `selfhost_format_test.ts` — over every file in
// `tests/cases/**/*.vl` and asserts the same three formatter guarantees the host
// must uphold:
//
//   1. Idempotent:        format(format(s)) === format(s).
//   2. Round-trip (AST):  the AST of format(s) is structurally equivalent to the
//                         AST of s (spans + the typechecker's resolved type
//                         decorations excluded) — checked with the host `checkOnly`
//                         oracle, the SAME oracle `format_test.ts` uses.
//   3. Comment-preserving: every comment text survives in format(s).
//
// Files the host parser rejects with a real SYNTAX error have no faithful AST, so
// they are exempt from the fidelity guarantees (mirrors `format_test.ts`). The
// self-host parser's own coverage gaps are NOT in scope here — only files the host
// can parse are asserted, and `format.vl` reproduces all of them. When that set
// reaches parity with `format.ts` over the corpus, `format.ts` is deletable.
//
// Mechanics: a single in-memory DRIVER module (the same shape as
// `selfhost_format_test.ts`'s) lexes → parses → formats each case TWICE inside
// wasm (so idempotency is checked in-engine) and prints the first output framed.
// The whole corpus compiles + runs once (cached); each `Deno.test` then looks up
// its file's result. A wasm trap is captured and surfaces as a failure pinned to
// the offending file rather than aborting the run.
//
// Run: deno test -A tests/selfhost_format_corpus_test.ts

import { checkOnly } from "../compiler/compile.ts";
import { compileProgramCached } from "./_selfhost_cache.ts";

const compilerUrl = (name: string) =>
  new URL(`../compiler/${name}`, import.meta.url).pathname;
const LEXER = compilerUrl("lexer.vl");
const AST = compilerUrl("ast.vl");
const PARSER = compilerUrl("parser.vl");
const TYPECHECK = compilerUrl("typecheck.vl");
const FORMAT = compilerUrl("format.vl");
const DRIVER = compilerUrl("__format_corpus_test_driver__.vl");

// Hand-rolled asserts (repo convention — no std import map).
const assert = (cond: boolean, msg: string): void => {
  if (!cond) throw new Error(msg);
};
const assertEquals = <T>(actual: T, expected: T, msg?: string): void => {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${msg ? msg + ": " : ""}expected ${e}, got ${a}`);
};

// ── AST normalization for structural equivalence (copied from format_test.ts) ──
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

// ── corpus walk ────────────────────────────────────────────────────────────
const walk = async function* (dir: URL): AsyncGenerator<URL> {
  for await (const entry of Deno.readDir(dir)) {
    const child = new URL(entry.name + (entry.isDirectory ? "/" : ""), dir);
    if (entry.isDirectory) yield* walk(child);
    else if (entry.name.endsWith(".vl")) yield child;
  }
};
const corpusFiles = async (): Promise<URL[]> => {
  const files: URL[] = [];
  for await (const f of walk(new URL("./cases/", import.meta.url))) files.push(f);
  files.sort((a, b) => a.href.localeCompare(b.href));
  return files;
};

// ── trap-capturing wasm runner (returns partial logs even on trap) ───────────
const runWasmCapture = async (
  wasm: Uint8Array,
): Promise<{ logs: string[]; trapped: boolean }> => {
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
  } catch (_err) {
    return { logs, trapped: true };
  }
};

// ── driver: lex → parse → format TWICE, print first output framed ────────────
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
  0
}
`;

// Compile + run the whole corpus once; memoize the per-index results.
type CaseResult = { idem: boolean; out: string };
let resultsPromise: Promise<Map<number, CaseResult>> | undefined;

const files = await corpusFiles();
const srcs = files.map((f) => Deno.readTextFileSync(f));
const names = files.map((f) => f.href.replace(/.*\/cases\//, "cases/"));
// Only files the host can parse are subject to the fidelity guarantees.
const parseable = srcs.map((s) => !hasSyntaxError(s));

const runAll = (): Promise<Map<number, CaseResult>> =>
  resultsPromise ??= (async () => {
    const driverBody = srcs
      .map((s, i) => (parseable[i] ? `runCase(${i}, ${JSON.stringify(s)})` : ""))
      .filter(Boolean)
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
      throw new Error(
        "self-hosted formatter driver failed to compile: " +
          diagnostics.filter((d) => d.severity === "error").map((d) => d.message).join("; "),
      );
    }
    const { logs } = await runWasmCapture(wasm);
    const byIdx = new Map<number, CaseResult>();
    for (let i = 0; i < logs.length; i++) {
      if (logs[i].startsWith("@@CASE@@\t")) {
        const idx = parseInt(logs[i].slice("@@CASE@@\t".length));
        const idemLine = logs[i + 1] ?? "";
        const outMarker = logs[i + 2] ?? "";
        if (idemLine.startsWith("@@IDEM@@\t") && outMarker === "@@OUT@@") {
          byIdx.set(idx, {
            idem: idemLine.slice("@@IDEM@@\t".length) === "1",
            out: logs[i + 3] ?? "",
          });
          i += 3;
        }
      }
    }
    return byIdx;
  })();

for (let i = 0; i < files.length; i++) {
  if (!parseable[i]) continue; // exempt: no faithful AST for a syntax-erroring file
  const name = "corpus: " + names[i];
  const src = srcs[i];
  Deno.test(name, async () => {
    const got = (await runAll()).get(i);
    assert(got !== undefined, `${name}: formatter trapped or produced no output`);
    const out = got!.out;

    // 1. Idempotent (checked in-engine: format(format(s)) === format(s)).
    assert(got!.idem, `${name}: not idempotent`);

    // 2. Round-trip: the output re-parses with no NEW syntax error and yields a
    //    structurally-equivalent AST.
    assert(!hasSyntaxError(out), `${name}: formatted output introduced a syntax error`);
    assertEquals(
      astShape(out),
      astShape(src),
      `${name}: formatted AST differs structurally from the original`,
    );

    // 3. Every comment text survives somewhere in the output.
    const { comments } = checkOnly(src);
    for (const c of comments) {
      assert(out.includes(c.text), `${name}: lost comment ${JSON.stringify(c.text)}`);
    }
  });
}
