// Runs the VL-in-VL lexer (`compiler/lexer.vl`) through the real VL toolchain and
// checks the token stream it produces. VL has no module system yet, so the lexer
// source is concatenated ahead of a `.vl` driver (`tests/selfhost/lexer_harness.vl`, which
// embeds a representative sample and prints one `KIND|text|value|line:col` line
// per token), the whole thing is compiled to wasm and run, and the captured log
// is diffed against the expected token list.
//
// This is the proof the self-hosted lexer actually compiles and runs end to end —
// not just that the TS lexer agrees with itself. It exercises the dropped H2
// workarounds directly: positions are rendered with the real `toString`, and the
// `\x41` / `\u{…}` escapes decode via `fromCodePoint`.

import { compile, runWasm } from "../compiler/compile.ts";

const assertEquals = <T>(actual: T, expected: T, msg?: string): void => {
  const a = JSON.stringify(actual, null, 2);
  const e = JSON.stringify(expected, null, 2);
  if (a !== e) throw new Error(`${msg ? msg + ": " : ""}expected ${e}, got ${a}`);
};

const read = (rel: string) =>
  Deno.readTextFileSync(new URL(rel, import.meta.url));

const lexer = read("../compiler/lexer.vl");

// Compile `lexer.vl ++ driver`, run it, return the captured log lines.
const runDriver = async (driver: string): Promise<string[]> => {
  const { wasm, diagnostics } = await compile(lexer + "\n" + driver);
  const errors = diagnostics.filter((d) => d.severity === "error");
  if (errors.length > 0 || !wasm) {
    throw new Error(
      "self-hosted lexer failed to compile: " +
        errors.map((d) => d.message).join("; "),
    );
  }
  const { logs } = await runWasm(wasm);
  return logs;
};

Deno.test("self-hosted lexer compiles, runs, and tokenizes the sample", async () => {
  const logs = await runDriver(read("./selfhost/lexer_harness.vl"));
  // The harness prints every token then a diagnostics summary. Assert the whole
  // ordered stream — an extra/missing/misplaced token fails. `\n` newline-token
  // text and decoded escape values appear verbatim in the log lines.
  const expected = [
    "FUNCTION|function||1:0",
    "ID|add||1:9",
    "LPAREN|(||1:12",
    "ID|a||1:13",
    "COLON|:||1:14",
    "ID|i32||1:16",
    "COMMA|,||1:19",
    "ID|b||1:21",
    "COLON|:||1:22",
    "ID|i32||1:24",
    "RPAREN|)||1:27",
    "COLON|:||1:28",
    "ID|i32||1:30",
    "LBRACE|{||1:34",
    "NEWLINE|\n||1:35",
    "NEWLINE|\n||2:24",
    "LET|let||3:2",
    "ID|r||3:6",
    "EQUAL|=||3:8",
    "ID|a||3:10",
    "PLUS|+||3:12",
    "ID|b||3:14",
    "NEWLINE|\n||3:27",
    "RETURN|return||4:2",
    "ID|r||4:9",
    "NEWLINE|\n||4:10",
    "RBRACE|}||5:0",
    "NEWLINE|\n||5:1",
    "LET|let||6:0",
    "ID|ok||6:4",
    "EQUAL|=||6:7",
    "ID|a||6:9",
    "GREATER_THAN_OR_EQUAL_TO|>=||6:11",
    "NUMBER|0||6:14",
    "AND|&&||6:16",
    "ID|b||6:19",
    "LESS_THAN_OR_EQUAL_TO|<=||6:21",
    "NUMBER|9||6:24",
    "OR|||||6:26",
    "ID|c||6:29",
    "NOT_EQUAL_TO|!=||6:31",
    "NUMBER|3||6:34",
    "NEWLINE|\n||6:35",
    "LET|let||7:0",
    "ID|q||7:4",
    "EQUAL|=||7:6",
    "ID|obj||7:8",
    "QUESTION_DOT|?.||7:11",
    "ID|field||7:13",
    "QUESTION_QUESTION|??||7:19",
    "NUMBER|1.5||7:22",
    "NEWLINE|\n||7:25",
    "LET|let||8:0",
    "ID|ch||8:4",
    "EQUAL|=||8:7",
    "CHAR|'a'|a|8:9",
    "NEWLINE|\n||8:12",
    "LET|let||9:0",
    "ID|nl||9:4",
    "EQUAL|=||9:7",
    "CHAR|'\\n'|\n|9:9",
    "NEWLINE|\n||9:13",
    "LET|let||10:0",
    "ID|s||10:4",
    "EQUAL|=||10:6",
    'STRING|"hi\\tthere\\n"|hi\tthere\n|10:8',
    "NEWLINE|\n||10:21",
    "LET|let||11:0",
    "ID|hx||11:4",
    "EQUAL|=||11:7",
    // `\x41\x42` now decodes to `AB` via `fromCodePoint` (was raw lexeme in the spike).
    'STRING|"\\x41\\x42"|AB|11:9',
    "NEWLINE|\n||11:19",
    "FOR|for||12:0",
    "ID|i||12:4",
    "IN|in||12:6",
    "NUMBER|0||12:9",
    "TO|to||12:11",
    "NUMBER|10||12:14",
    "STEP|step||12:17",
    "NUMBER|2||12:22",
    "LBRACE|{||12:24",
    "ID|i||12:26",
    "PLUSPLUS|++||12:27",
    "RBRACE|}||12:30",
    "NEWLINE|\n||12:31",
    "EOF|||13:0",
    "== diagnostics: 0 ==",
  ];
  assertEquals(logs, expected);
});

Deno.test("self-hosted lexer decodes \\u and \\u{…} escapes via fromCodePoint", async () => {
  // A driver exercising the numeric escapes the spike could not materialize: the
  // \x / \u / \u{…} forms now decode to the actual code point. The driver prints
  // the decoded value of each STRING token (kind|value), proving the bytes.
  const driver = `
let r = tokenize("a = \\"\\\\x41\\\\u0042\\\\u{43}\\"")
let i = 0
while i < r.tokens.length {
  let t = r.tokens[i]
  if t.kind == "STRING" { print("STRING=" + t.value) }
  i = i + 1
}
print("diags: " + toString(r.diags.length))
`;
  const logs = await runDriver(driver);
  assertEquals(logs, [
    "STRING=ABC", // \x41 -> A, B -> B, \u{43} -> C
    "diags: 0",
  ]);
});

Deno.test("self-hosted lexer reports unterminated string and bad char literals", async () => {
  // A driver that feeds malformed input and prints the diagnostics. Kept inline
  // (not in the sample) so the happy-path fixture stays clean.
  const driver = `
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
`;
  const logs = await runDriver(driver);
  assertEquals(logs, [
    "kinds: 4", // x  =  STRING(unterminated)  EOF
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
  ]);
});
