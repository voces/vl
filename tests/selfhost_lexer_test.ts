// Runs the VL-in-VL lexer (`compiler/lexer.vl`) through the real VL toolchain and
// checks the token stream it produces. VL has no module system yet, so the lexer
// source is concatenated ahead of a `.vl` driver, compiled to wasm and run, and the
// captured log is diffed against the expected token list.
//
// This is the proof the self-hosted lexer compiles and runs end to end. It exercises
// the dropped H2 workarounds directly: positions render with the real `toString`, and
// `\x41` / `\u{…}` escapes decode via `fromCodePoint`.
//
// PERF (compile-once): the cases all compile the same `lexer.vl` base and differ only
// in their driver. Rather than recompile per case, they share ONE compile: each case
// runs in its own function (so its `let`s don't collide), `tokenize` is stateless so
// no reset is needed, and a `@@N` sentinel line separates cases in the log for the
// host to split. The sample case reads its driver from the standalone fixture
// (`tests/selfhost/lexer_harness.vl`) verbatim at runtime.

import { runWasm } from "../compiler/compile.ts";
import { compileCached } from "./_selfhost_cache.ts";

const assertEquals = <T>(actual: T, expected: T, msg?: string): void => {
  const a = JSON.stringify(actual, null, 2);
  const e = JSON.stringify(expected, null, 2);
  if (a !== e) throw new Error(`${msg ? msg + ": " : ""}expected ${e}, got ${a}`);
};

const read = (rel: string) =>
  Deno.readTextFileSync(new URL(rel, import.meta.url));

const lexer = read("../compiler/lexer.vl");

type Case = { name: string; body: string; expected: string[] };

const CASES: Case[] = [
  {
    name: "compiles, runs, and tokenizes the sample",
    // The standalone fixture is pure top-level driver code — run it verbatim.
    body: read("./selfhost/lexer_harness.vl"),
    expected: [
      "FUNCTION|function||1:0",
      "IDENT|add||1:9",
      "LPAREN|(||1:12",
      "IDENT|a||1:13",
      "COLON|:||1:14",
      "IDENT|i32||1:16",
      "COMMA|,||1:19",
      "IDENT|b||1:21",
      "COLON|:||1:22",
      "IDENT|i32||1:24",
      "RPAREN|)||1:27",
      "COLON|:||1:28",
      "IDENT|i32||1:30",
      "LBRACE|{||1:34",
      "NEWLINE|\n||1:35",
      "NEWLINE|\n||2:24",
      "LET|let||3:2",
      "IDENT|r||3:6",
      "EQUAL|=||3:8",
      "IDENT|a||3:10",
      "PLUS|+||3:12",
      "IDENT|b||3:14",
      "NEWLINE|\n||3:27",
      "RETURN|return||4:2",
      "IDENT|r||4:9",
      "NEWLINE|\n||4:10",
      "RBRACE|}||5:0",
      "NEWLINE|\n||5:1",
      "LET|let||6:0",
      "IDENT|ok||6:4",
      "EQUAL|=||6:7",
      "IDENT|a||6:9",
      "GE|>=||6:11",
      "NUMBER|0||6:14",
      "AND|&&||6:16",
      "IDENT|b||6:19",
      "LE|<=||6:21",
      "NUMBER|9||6:24",
      "OR|||||6:26",
      "IDENT|c||6:29",
      "NE|!=||6:31",
      "NUMBER|3||6:34",
      "NEWLINE|\n||6:35",
      "LET|let||7:0",
      "IDENT|q||7:4",
      "EQUAL|=||7:6",
      "IDENT|obj||7:8",
      "QUESTION_DOT|?.||7:11",
      "IDENT|field||7:13",
      "QUESTION_QUESTION|??||7:19",
      "NUMBER|1.5||7:22",
      "NEWLINE|\n||7:25",
      "LET|let||8:0",
      "IDENT|ch||8:4",
      "EQUAL|=||8:7",
      "CHAR|'a'|a|8:9",
      "NEWLINE|\n||8:12",
      "LET|let||9:0",
      "IDENT|nl||9:4",
      "EQUAL|=||9:7",
      "CHAR|'\\n'|\n|9:9",
      "NEWLINE|\n||9:13",
      "LET|let||10:0",
      "IDENT|s||10:4",
      "EQUAL|=||10:6",
      'STRING|"hi\\tthere\\n"|hi\tthere\n|10:8',
      "NEWLINE|\n||10:21",
      "LET|let||11:0",
      "IDENT|hx||11:4",
      "EQUAL|=||11:7",
      'STRING|"\\x41\\x42"|AB|11:9',
      "NEWLINE|\n||11:19",
      "FOR|for||12:0",
      "IDENT|i||12:4",
      "IDENT|in||12:6",
      "NUMBER|0||12:9",
      "IDENT|to||12:11",
      "NUMBER|10||12:14",
      "IDENT|step||12:17",
      "NUMBER|2||12:22",
      "LBRACE|{||12:24",
      "IDENT|i||12:26",
      "PLUSPLUS|++||12:27",
      "RBRACE|}||12:30",
      "NEWLINE|\n||12:31",
      "EOF|||13:0",
      "== diagnostics: 0 ==",
    ],
  },
  {
    name: "decodes \\u and \\u{…} escapes via fromCodePoint",
    body: `
let r = tokenize("a = \\"\\\\x41\\\\u0042\\\\u{43}\\"")
let i = 0
while i < r.tokens.length {
  let t = r.tokens[i]
  if t.kind == "STRING" { print("STRING=" + t.value) }
  i = i + 1
}
print("diags: " + toString(r.diags.length))
`,
    expected: ["STRING=ABC", "diags: 0"],
  },
  {
    name: "reports unterminated string and bad char literals",
    body: `
let bad = tokenize("x = \\"oops")
print("kinds: " + toString(bad.tokens.length))
print("diags: " + toString(bad.diags.length))
let k = 0
while k < bad.diags.length {
  print(bad.diags[k].msg)
  k = k + 1
}
let e = tokenize("c = ''")
print("empty-char diags: " + toString(e.diags.length))
print(e.diags[0].msg)
let m = tokenize("c = 'ab'")
print("multi-char diags: " + toString(m.diags.length))
print(m.diags[0].msg)
let bx = tokenize("s = \\"\\\\xZZ\\"")
print("badhex diags: " + toString(bx.diags.length))
print(bx.diags[0].msg)
let uc = tokenize("@")
print("unexpected diags: " + toString(uc.diags.length))
print(uc.diags[0].msg)
`,
    expected: [
      "kinds: 4",
      "diags: 1",
      "Unterminated string literal",
      "empty-char diags: 1",
      "Empty char literal",
      "multi-char diags: 1",
      "Char literal must contain exactly one character",
      "badhex diags: 1",
      "Invalid \\x escape (needs two hex digits)",
      "unexpected diags: 1",
      "Unexpected character",
    ],
  },
];

// One compile: each case runs in its own function (scopes its `let`s); a `@@N`
// sentinel precedes each case's output so the host can split the shared log.
const driver = CASES.map((c, i) => `function lcase${i}(): i32 {\n${c.body}\n0\n}`)
  .join("\n") + "\n" +
  CASES.map((_, i) => `print("@@${i}")\nlcase${i}()`).join("\n") + "\n";

let allLogs: Promise<Map<number, string[]>> | undefined;
const runAll = (): Promise<Map<number, string[]>> =>
  allLogs ??= (async () => {
    const { wasm, diagnostics } = await compileCached(lexer + "\n" + driver);
    const errors = diagnostics.filter((d) => d.severity === "error");
    if (errors.length > 0 || !wasm) {
      throw new Error(
        "self-hosted lexer failed to compile: " +
          errors.map((d) => d.message).join("; "),
      );
    }
    const { logs } = await runWasm(wasm);
    const byCase = new Map<number, string[]>();
    let cur = -1;
    for (const line of logs) {
      const m = line.match(/^@@(\d+)$/);
      if (m) {
        cur = Number(m[1]);
        byCase.set(cur, []);
      } else if (cur >= 0) byCase.get(cur)!.push(line);
    }
    return byCase;
  })();

for (let i = 0; i < CASES.length; i++) {
  Deno.test(`self-hosted lexer ${CASES[i].name}`, async () => {
    assertEquals((await runAll()).get(i) ?? [], CASES[i].expected);
  });
}
