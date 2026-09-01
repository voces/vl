// D9.10 signature help: the parameter popup while typing a call.
//
// TWO HALVES, GRADED SEPARATELY. The ARGUMENT COUNTER (`lsp/src/signatureHelp.ts`)
// is pure and lexical — which call the cursor is in, and which argument — and its
// tests need no seed. The PARAMETER TABLE is the native `sigAt` family (D9.10's
// one new checker export, `compiler/check_query.vl`), so those tests load the real
// seed (`build/vl-compiler.wasm`) and self-ignore without one, the same convention
// as the rest of the wasm suite.
//
// Cursor positions in the pure table are written as a `|` in the source string
// and stripped before the scan, so the case reads the way the user's screen does.

import {
  callSiteAt,
  repairedSource,
  signatureLabel,
} from "../lsp/src/signatureHelp.ts";
import { loadWasmChecker } from "../lsp/src/wasmCheckerNode.ts";

const SEED = new URL("../build/vl-compiler.wasm", import.meta.url).pathname;
const seedExists = (() => {
  try {
    Deno.statSync(SEED);
    return true;
  } catch {
    return false;
  }
})();
const ignore = !seedExists;
const log = (_m: string) => {};

// ---- the argument counter (pure) -------------------------------------------

/** Split a `|`-marked source into text + the 0-based cursor position. */
const cursor = (marked: string): { text: string; line: number; character: number } => {
  const at = marked.indexOf("|");
  if (at < 0) throw new Error(`case has no | cursor marker: ${marked}`);
  const text = marked.slice(0, at) + marked.slice(at + 1);
  const before = marked.slice(0, at);
  const nl = before.lastIndexOf("\n");
  return {
    text,
    line: (before.match(/\n/g) ?? []).length,
    character: at - (nl + 1),
  };
};

/** `callee/activeArgument`, or "none" — the whole answer, in one string. */
const siteOf = (marked: string): string => {
  const { text, line, character } = cursor(marked);
  const site = callSiteAt(text, line, character);
  if (site === undefined) return "none";
  return `${site.member ? "." : ""}${site.name}/${site.activeArgument}`;
};

// One row per thing that can separate — or fail to separate — two arguments.
// `want` is `callee/activeArgument` (`.name` for a member spelling), or "none".
const COUNTER_CASES: [string, string, string][] = [
  ["empty argument list", "f(|)", "f/0"],
  ["first argument", "f(|a, b)", "f/0"],
  ["second argument", "f(a, |b)", "f/1"],
  ["after a trailing comma", "f(a, b, |)", "f/2"],
  ["cursor at the very end, unclosed", "f(a, |", "f/1"],

  // Nesting: an inner call's commas belong to the inner call.
  ["inside a nested call", "f(g(1, |2))", "g/1"],
  ["after a nested call", "f(g(1, 2), |x)", "f/1"],
  ["array literal argument", "f([1, 2], |x)", "f/1"],
  ["inside an array literal", "f([1, |2])", "f/0"],
  ["object literal argument", "f({ a: 1, b: 2 }, |x)", "f/1"],
  ["grouping parens are not a call", "f(a, (b + |c))", "f/1"],

  // Literals: a comma inside one is text, not a separator.
  ["comma inside a string", 'f("a, |b")', "f/0"],
  ["string argument, cursor after it", 'f("a, b"|)', "f/0"],
  ["a char literal holding a comma", "f(a, ',', |b)", "f/2"],
  ["unterminated string swallows its commas", 'f("a, b|', "f/0"],

  // Interpolated literals: one token to the tokenizer, expression source inside
  // a hole. BOTH quoted forms interpolate, so both re-enter — a `"` hole that
  // did not would silently answer about the wrong call.
  ["inside a template hole", "f(`v=\\{g(1, |2)}`)", "g/1"],
  ["template TEXT is not a call", "f(`a, b|c`)", "f/0"],
  ["a hole with no call falls out to the literal's call", "f(`\\{x|}`)", "f/0"],
  ["a nested template's hole", "f(`\\{g(`\\{h(1, |2)}`)}`)", "h/1"],
  ["a comma in template text is not a separator", "f(`a, b`, |x)", "f/1"],
  ["inside a PLAIN STRING hole", 'f("v=\\{g(1, |2)}")', "g/1"],
  ["a string hole holding a string", 'f("v=\\{g("a", |2)}")', "g/1"],
  ["a plain-string hole inside a template hole", 'f(`\\{g("\\{h(1, |2)}")}`)', "h/1"],
  ["a brace in string TEXT opens no hole", 'f("{a, b|c}")', "f/0"],

  // Member spellings.
  ["member call", "x.f(|1)", ".f/0"],
  ["member call, second argument", "x.f(1, |2)", ".f/1"],
  ["a receiver's own call is not a member", "f(x).g(|1)", ".g/0"],

  // Not a call at all.
  ["outside any call", "let x = 1|", "none"],
  ["after the closer", "f(a)|", "none"],
  ["a keyword is never a callee", "if (a|) { b }", "none"],
  ["inside a comment", "g(1, 2) // f(a, |b)", "none"],
  ["a comment inside the argument list still counts", "f(a, // c\n  |b)", "f/1"],

  // Multi-line calls.
  ["argument on a later line", "f(\n  a,\n  |b,\n)", "f/1"],
  ["callee on an earlier line", "f(\n  |a\n)", "f/0"],
];

Deno.test("signature-help: the argument counter, one row per separator kind", () => {
  const wrong: string[] = [];
  for (const [what, marked, want] of COUNTER_CASES) {
    const got = siteOf(marked);
    if (got !== want) {
      wrong.push(`${what} (${JSON.stringify(marked)}): want ${want}, got ${got}`);
    }
  }
  if (wrong.length > 0) throw new Error(wrong.join("\n"));
});

Deno.test("signature-help: the innermost CALL wins, not the innermost group", () => {
  // `[` and `(` groups nest between the cursor and the call it belongs to.
  const { text, line, character } = cursor("outer(a, xs[inner(1, |2)])");
  const site = callSiteAt(text, line, character);
  if (site?.name !== "inner" || site.activeArgument !== 1) {
    throw new Error(`want inner/1, got ${JSON.stringify(site)}`);
  }
  if (site.callee.line !== 0 || site.callee.character !== 12) {
    throw new Error(`want the callee at 0:12, got ${JSON.stringify(site.callee)}`);
  }
});

Deno.test("signature-help: a mid-edit buffer gets closers for the CHECKER, not the counter", () => {
  // The counter needs no repair — it already answered. The closers are what the
  // checker would need to parse the buffer at all.
  const { text, line, character } = cursor('greet("a", |\n}');
  const site = callSiteAt(text, line, character)!;
  if (site.activeArgument !== 1) {
    throw new Error(`want argument 1 with no repair, got ${site.activeArgument}`);
  }
  if (site.missingClosers !== ")") {
    throw new Error(`want closers ")", got ${JSON.stringify(site.missingClosers)}`);
  }
  const repaired = repairedSource(text, line, character, site);
  if (repaired !== 'greet("a", )\n}') {
    throw new Error(`want the closer at the cursor, got ${JSON.stringify(repaired)}`);
  }
});

Deno.test("signature-help: an enclosing BLOCK brace is not closed by the repair", () => {
  // Its `}` is further down the file, where the scan (which stops at the cursor)
  // never reached. An object literal INSIDE the call is closed, because it has no
  // closer yet.
  const outer = cursor("function main() {\n  f({ a: 1, |\n}\n");
  const site = callSiteAt(outer.text, outer.line, outer.character)!;
  if (site.missingClosers !== "})") {
    throw new Error(
      `want the object literal + the call closed and the block left alone ("})"), ` +
        `got ${JSON.stringify(site.missingClosers)}`,
    );
  }
});

Deno.test("signature-help: a balanced buffer still reports closers — they are a repair, not a verdict", () => {
  // `f("a"|, 1)` is balanced; the `)` is three characters to the right and the
  // scan stops at the cursor, so it cannot see it. This is why the host tries the
  // buffer AS WRITTEN first and only then the repair.
  const { text, line, character } = cursor('f("a"|, 1)');
  const site = callSiteAt(text, line, character)!;
  if (site.missingClosers !== ")") {
    throw new Error(`want ")", got ${JSON.stringify(site.missingClosers)}`);
  }
});

// ---- the label renderer (pure) ----------------------------------------------

Deno.test("signature-help: the label addresses each parameter by offset", () => {
  const { label, parameters } = signatureLabel("greet", {
    params: [{ name: "name", type: "string" }, { name: "times", type: "i32" }],
    ret: "string",
  });
  if (label !== "greet(name: string, times: i32) => string") {
    throw new Error(`want the named render, got ${JSON.stringify(label)}`);
  }
  const slice = (i: number) => label.slice(parameters[i][0], parameters[i][1]);
  if (slice(0) !== "name: string" || slice(1) !== "times: i32") {
    throw new Error(
      `want the offsets to select each parameter, got ${JSON.stringify([slice(0), slice(1)])}`,
    );
  }
});

Deno.test("signature-help: a nameless parameter renders as its type alone", () => {
  // A function-typed VALUE: `TyFunc` carries no parameter names by design.
  const { label, parameters } = signatureLabel("lam", {
    params: [{ name: "", type: "i32" }, { name: "", type: "string" }],
    ret: "i32",
  });
  if (label !== "lam(i32, string) => i32") {
    throw new Error(`want the bare render, got ${JSON.stringify(label)}`);
  }
  if (label.slice(parameters[1][0], parameters[1][1]) !== "string") {
    throw new Error("want the second parameter's offsets to select `string`");
  }
});

Deno.test("signature-help: a zero-parameter signature is a signature", () => {
  const { label, parameters } = signatureLabel("nil", { params: [], ret: "i32" });
  if (label !== "nil() => i32" || parameters.length !== 0) {
    throw new Error(`want "nil() => i32" with no parameters, got ${label}`);
  }
});

// ---- the native parameter table (seed-backed) -------------------------------

const key = "main.vl";
const read = (_k: string) => undefined;

const SRC = [
  "type Handler = { cb: (i32) => i32 }", // 0
  "function greet(name: string, times: i32) { name }", // 1
  "function shout(self: string, n: i32) { self }", // 2
  "function idfn<T>(x: T, y: i32) { x }", // 3
  "function nil() { 1 }", // 4
  "const lam = (a: i32, b: string) => a", // 5
  "function main() {", // 6
  '  greet("a", 1)', // 7
  '  "x".shout(2)', // 8
  '  shout("x", 2)', // 9
  "  idfn(1, 2)", // 10
  '  lam(1, "b")', // 11
  "  nil()", // 12
  "  const h: Handler = { cb: (v: i32) => v }", // 13
  "  h.cb(1)", // 14
  '  print(`v=\\{greet("q", 3)}`)', // 15
  "}", // 16
].join("\n");

/** The rendered signature at a cursor, or "none" — the whole pipeline in one call. */
const helpAt = async (
  src: string,
  line: number,
  character: number,
): Promise<string> => {
  const checker = loadWasmChecker(SEED, log)!;
  const site = callSiteAt(src, line, character);
  if (site === undefined) return "none";
  const ask = (s: string) =>
    checker.signatureAt(s, key, read, site.callee.line, site.callee.character);
  let sig = await ask(src);
  if (sig === undefined) {
    const repaired = repairedSource(src, line, character, site);
    if (repaired !== undefined) sig = await ask(repaired);
  }
  if (sig === undefined) return "none";
  const { label, parameters } = signatureLabel(site.name, sig);
  const active = parameters[site.activeArgument];
  return `${label} @${active === undefined ? "-" : label.slice(active[0], active[1])}`;
};

Deno.test({
  name: "signature-help(wasm): a declared function's parameter NAMES come from its declaration",
  ignore,
}, async () => {
  // `TyFunc` carries types only; the names are the decl's, zipped by `sigAt`.
  const first = await helpAt(SRC, 7, 9);
  if (first !== "greet(name: string, times: i32) => string @name: string") {
    throw new Error(`want the first parameter active, got ${first}`);
  }
  const second = await helpAt(SRC, 7, 13);
  if (second !== "greet(name: string, times: i32) => string @times: i32") {
    throw new Error(`want the second parameter active, got ${second}`);
  }
});

Deno.test({
  name: "signature-help(wasm): a UFCS call binds self — the same function, two spellings",
  ignore,
}, async () => {
  // `"x".shout(2)`: the receiver already supplied `self`, so the table drops it
  // and argument 0 is `n`. The DIRECT spelling of the same function shows both.
  const ufcs = await helpAt(SRC, 8, 12);
  if (ufcs !== "shout(n: i32) => string @n: i32") {
    throw new Error(`want self dropped at the member spelling, got ${ufcs}`);
  }
  const direct = await helpAt(SRC, 9, 9);
  if (direct !== "shout(self: string, n: i32) => string @self: string") {
    throw new Error(`want self shown at the direct spelling, got ${direct}`);
  }
});

Deno.test({
  name: "signature-help(wasm): a generic function shows its DECLARED form",
  ignore,
}, async () => {
  // MEASURED, not chosen: the checker retains one type per binding, and that is
  // the declared `TyFunc` with its type variables — no per-call instantiation is
  // recorded to render (hover says the same thing at the same position). If
  // per-occurrence instantiation ever lands, this row is what changes.
  const got = await helpAt(SRC, 10, 8);
  if (got !== "idfn(x: T, y: i32) => T @x: T") {
    throw new Error(`want the declared form, got ${got}`);
  }
});

Deno.test({
  name: "signature-help(wasm): a function-typed VALUE has types but no parameter names",
  ignore,
}, async () => {
  const got = await helpAt(SRC, 11, 7);
  if (got !== "lam(i32, string) => i32 @i32") {
    throw new Error(`want the nameless render, got ${got}`);
  }
});

Deno.test({
  name: "signature-help(wasm): a zero-parameter call is answered, not refused",
  ignore,
}, async () => {
  // `sigAt` returns 0 rows, which is a signature; -1 is the refusal. Conflating
  // them would make every `nil()` look like an unknown callee.
  const got = await helpAt(SRC, 12, 6);
  if (got !== "nil() => i32 @-") {
    throw new Error(`want a zero-parameter signature, got ${got}`);
  }
});

Deno.test({
  name: "signature-help(wasm): a struct field holding a function is callable",
  ignore,
}, async () => {
  const got = await helpAt(SRC, 14, 7);
  if (got !== "cb(i32) => i32 @i32") {
    throw new Error(`want the field's function type, got ${got}`);
  }
});

Deno.test({
  name: "signature-help(wasm): a call inside a template hole resolves",
  ignore,
}, async () => {
  // The literal is ONE token to the tokenizer; the hole is re-entered as source.
  const got = await helpAt(SRC, 15, 25);
  if (got !== "greet(name: string, times: i32) => string @times: i32") {
    throw new Error(`want the hole's call, got ${got}`);
  }
});

Deno.test({
  name: "signature-help(wasm): a BUILTIN callee has no parameter table (a named gap)",
  ignore,
}, async () => {
  // `print`/`xs.push`/`s.slice` are typed in the checker's call arms without a
  // recorded signature, which is the same reason member hover is dark on them.
  // Closing it wants the builtin table to grow a parameter column, not a second
  // resolver — this row is the witness that the gap is still open.
  const got = await helpAt(SRC, 15, 8);
  if (got !== "none") {
    throw new Error(`want no signature for a builtin, got ${got}`);
  }
});

Deno.test({
  name: "signature-help(wasm): a mid-edit buffer with no closer still answers",
  ignore,
}, async () => {
  // The checker needs a parseable program to have a symbol table at all, so the
  // buffer as written yields nothing and the closer repair is what rescues it.
  const src = "function greet(name: string, times: i32) { name }\n" +
    'function main() {\n  greet("a", \n}\n';
  const got = await helpAt(src, 2, 13);
  if (got !== "greet(name: string, times: i32) => string @times: i32") {
    throw new Error(`want the repaired answer, got ${got}`);
  }
});

Deno.test({
  name: "signature-help(wasm): a check ERROR does not stop the signature",
  ignore,
}, async () => {
  // Wrong arity is a diagnostic, not a parse failure — the symbol pass still ran,
  // and a user typing a third argument is exactly who needs to see the signature.
  const src = "function greet(name: string, times: i32) { name }\n" +
    'function main() {\n  greet("a", 1, 2)\n}\n';
  const got = await helpAt(src, 2, 17);
  if (got !== "greet(name: string, times: i32) => string @-") {
    throw new Error(`want the signature with no parameter active, got ${got}`);
  }
});

Deno.test({
  name: "signature-help(wasm): an IMPORTED function keeps its source parameter names",
  ignore,
}, async () => {
  // The module merge mangles a dep's declarations (`add` → `add$m1`) but its
  // parameter names are source names, and the merged arena holds the FuncDecl —
  // the same route `fnSigStr` takes for hover.
  // The reader is keyed by the RESOLVED sibling path, as in the cross-file suite.
  const dep = "export function add(lhs: i32, rhs: i32) { lhs + rhs }\n";
  const src = 'import { add } from "./mathx"\nfunction main() {\n  add(1, 2)\n}\n';
  const checker = loadWasmChecker(SEED, log)!;
  const site = callSiteAt(src, 2, 6)!;
  const sig = await checker.signatureAt(
    src,
    "/proj/main.vl",
    (k: string) => (k.endsWith("mathx.vl") ? dep : undefined),
    site.callee.line,
    site.callee.character,
  );
  if (sig === undefined) throw new Error("want a signature for the imported name");
  const { label } = signatureLabel(site.name, sig);
  if (label !== "add(lhs: i32, rhs: i32) => i32") {
    throw new Error(`want the dep's source names, got ${label}`);
  }
});


Deno.test("signature-help: a DEFAULTED parameter renders its default", () => {
  // The protocol has no per-parameter "optional" flag, so the rendered default
  // is how optionality is communicated — and the default sits INSIDE that
  // parameter's offset pair, so the client highlights `punct: string = "!"`
  // whole when the cursor is on argument 1. That is what the reader needs: the
  // value that lands if they stop typing.
  const { label, parameters } = signatureLabel("greet", {
    params: [
      { name: "name", type: "string", dflt: "" },
      { name: "punct", type: "string", dflt: '"!"' },
    ],
    ret: "string",
  });
  if (label !== 'greet(name: string, punct: string = "!") => string') {
    throw new Error(`want the default rendered, got ${JSON.stringify(label)}`);
  }
  const slice = (i: number) => label.slice(parameters[i][0], parameters[i][1]);
  if (slice(1) !== 'punct: string = "!"') {
    throw new Error(
      `want the default inside the offsets, got ${JSON.stringify(slice(1))}`,
    );
  }
});

Deno.test({
  name:
    "signature-help(wasm): defaults reach the label — literal, module const, and `__callsite__`",
  ignore,
}, async () => {
  // The three forms v1 admits, each rendered as the author wrote it. The module
  // `const` arm is the one with a trap in it: the merged arena spells it
  // `SEP$m1` in a multi-module program, so the native side demangles before
  // handing it over — the same `demangleName` every other user-facing query
  // takes. Single-file here, where the two spellings coincide.
  const src = [
    'const SEP = "-"',
    'function greet(name: string, punct: string = "!") { name + punct }',
    "function pad(n: i32, w: i32 = 3, s: string = SEP) { s }",
    "function at(t: string, c: { file: string, line: i32, col: i32 } = __callsite__) { t + c.file }",
    "function main() {",
    '  greet("a")',
    "  pad(1)",
    '  at("x")',
    "}",
  ].join("\n");
  const one = await helpAt(src, 5, 9);
  if (one !== 'greet(name: string, punct: string = "!") => string @name: string') {
    throw new Error(`want the literal default rendered, got ${one}`);
  }
  const two = await helpAt(src, 6, 6);
  if (two !== "pad(n: i32, w: i32 = 3, s: string = SEP) => string @n: i32") {
    throw new Error(`want the const default rendered, got ${two}`);
  }
  const three = await helpAt(src, 7, 5);
  const wantThree =
    "at(t: string, c: {file: string, line: i32, col: i32} = __callsite__) => string @t: string";
  if (three !== wantThree) {
    throw new Error(`want the intrinsic rendered, got ${three}`);
  }
});
