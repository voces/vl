// Tests for the VL source formatter (`compiler/format.ts`, ROADMAP D4).
//
// Three things are asserted:
//   1. Representative constructs format to the expected canonical text.
//   2. IDEMPOTENCE: format(format(src)) === format(src) — for the unit fixtures
//      AND for every file in the test corpus.
//   3. SEMANTIC PRESERVATION: parse(format(src)) yields the same AST as
//      parse(src) (compared structurally, ignoring spans/types/scope) for every
//      corpus file that parses cleanly. Files that don't parse cleanly are still
//      exercised for idempotence (the formatter must be safe on any input) but
//      skipped for AST equality.
//
// The corpus round-trip is the load-bearing guarantee: formatting must never
// change meaning, and must never drop a comment (every corpus file — and the
// harness's own `// @directive` lines — are comments).

import { format, isFormatted } from "../compiler/format.ts";
import { checkOnly } from "../compiler/compile.ts";

// Tiny structural-equality assert (the repo has no std import map; the other
// test files likewise roll their own — see symbols_test.ts / run_test.ts).
const assertEquals = <T>(actual: T, expected: T, msg?: string): void => {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) {
    throw new Error(`${msg ? msg + ": " : ""}expected ${e}, got ${a}`);
  }
};

// ---- unit fixtures -------------------------------------------------------

const fixtures: { name: string; input: string; want: string }[] = [
  {
    name: "reindents a block to 4 spaces and normalizes spacing",
    input: "while i<5 {\n  s=s+i\n}\n",
    want: "while i < 5 {\n    s = s + i\n}\n",
  },
  {
    name: "preserves a trailing comment with one leading space",
    input: "print(x)   // hi\n",
    want: "print(x) // hi\n",
  },
  {
    name: "keeps a standalone comment",
    input: "// a note\nlet x = 1\n",
    want: "// a note\nlet x = 1\n",
  },
  {
    name: "no space inside call / index / group edges",
    input: "f( a , b )[ 0 ]\n",
    want: "f(a, b)[0]\n",
  },
  {
    name: "prefix and postfix unary hug their operand",
    input: "print( ++ x )\nprint( x ++ )\nlet y = - 1\nlet z = ! ( a )\n",
    want: "print(++x)\nprint(x++)\nlet y = -1\nlet z = !(a)\n",
  },
  {
    name: "binary minus keeps spaces",
    input: "let d = a-b\n",
    want: "let d = a - b\n",
  },
  {
    name: "object literal and annotation spacing",
    input: "let u:boolean|i32=5\nlet o={x:1,y:2}\n",
    want: "let u: boolean | i32 = 5\nlet o = { x: 1, y: 2 }\n",
  },
  {
    name: "if/then/else keyword spacing and parenthesised condition",
    input: "print(if(5>3)then 7 else 9)\n",
    want: "print(if (5 > 3) then 7 else 9)\n",
  },
  {
    name: "nested blocks indent cumulatively, closers dedent",
    input: "function f(b) {\nif b {\nreturn 7\n}\nreturn 0\n}\n",
    want:
      "function f(b) {\n    if b {\n        return 7\n    }\n    return 0\n}\n",
  },
  {
    name: "collapses multiple blank lines to one, strips leading/trailing blanks",
    input: "\n\nlet a = 1\n\n\n\nlet b = 2\n\n\n",
    want: "let a = 1\n\nlet b = 2\n",
  },
  {
    name: "labelled loop and break",
    input: "outer: for a in 1 to 5 {\nbreak outer\n}\n",
    want: "outer: for a in 1 to 5 {\n    break outer\n}\n",
  },
  {
    name: "property access chains hug the dot",
    input: "print( a . b ?. c )\n",
    want: "print(a.b?.c)\n",
  },
  {
    name: "empty input yields empty output",
    input: "",
    want: "",
  },
  {
    name: "whitespace-only input yields empty output",
    input: "   \n\t\n",
    want: "",
  },
];

for (const { name, input, want } of fixtures) {
  Deno.test(`fmt unit: ${name}`, () => {
    assertEquals(format(input), want);
    // Idempotence on every fixture.
    assertEquals(format(format(input)), format(input));
  });
}

Deno.test("fmt: isFormatted agrees with format", () => {
  assertEquals(isFormatted("let x = 1\n"), true);
  assertEquals(isFormatted("let x=1\n"), false);
});

// ---- corpus round-trip ---------------------------------------------------

// A structural projection of the AST that drops everything formatting may
// legitimately not reproduce byte-for-byte: source spans (`context`), inferred
// `*Type` objects, the program `scope`, and resolved function references. What
// remains is the load-bearing tree shape: node `type` discriminants, names,
// operators, literal values, and structural children. If THIS matches before
// and after formatting, meaning is preserved.
const DROP_KEYS = new Set([
  "context",
  "scope",
  "functionType",
  "variableType",
  "paramaterType",
  "returnType",
  "checkType",
  "valueType",
  "type", // node-`type` is kept via the explicit copy below
]);

// deno-lint-ignore no-explicit-any
const project = (node: any): any => {
  if (Array.isArray(node)) return node.map(project);
  if (node && typeof node === "object") {
    // deno-lint-ignore no-explicit-any
    const out: any = {};
    // Keep the discriminant node kind (a string `type`), but drop `type` when it
    // is itself a nested VLType object (those are inferred, not structural).
    if (typeof node.type === "string") out.kind = node.type;
    for (const [k, v] of Object.entries(node)) {
      if (DROP_KEYS.has(k)) continue;
      out[k] = project(v);
    }
    return out;
  }
  return node;
};

// deno-lint-ignore no-explicit-any
const projectProgram = (src: string): { ok: boolean; tree: any } => {
  try {
    const { ast, diagnostics } = checkOnly(src);
    const hasError = diagnostics.some((d) => d.severity === "error");
    return { ok: !hasError, tree: project(ast.statements) };
  } catch {
    return { ok: false, tree: null };
  }
};

const CASES_DIR = new URL("./cases/", import.meta.url);

const walk = async function* (dir: URL): AsyncGenerator<URL> {
  for await (const entry of Deno.readDir(dir)) {
    const child = new URL(entry.name + (entry.isDirectory ? "/" : ""), dir);
    if (entry.isDirectory) yield* walk(child);
    else if (entry.name.endsWith(".vl")) yield child;
  }
};

const corpus: URL[] = [];
for await (const f of walk(CASES_DIR)) corpus.push(f);
corpus.sort((a, b) => a.href.localeCompare(b.href));

for (const file of corpus) {
  const name = file.href.slice(CASES_DIR.href.length);
  Deno.test(`fmt corpus: ${name}`, async () => {
    const src = await Deno.readTextFile(file);
    const once = format(src);

    // Idempotence holds for EVERY file, regardless of whether it parses.
    assertEquals(format(once), once, "formatter is not idempotent");

    // Comments must survive: every non-directive `//` line still present.
    const commentLines = (s: string) =>
      s.split(/\r?\n/).map((l) => l.trim()).filter((l) =>
        l.startsWith("//")
      ).length;
    assertEquals(
      commentLines(once) >= commentLines(src),
      true,
      "formatting dropped comment line(s)",
    );

    // Semantic preservation: only for files that parse cleanly.
    const before = projectProgram(src);
    if (!before.ok) return; // skip xfail / intentionally-erroring fixtures
    const after = projectProgram(once);
    assertEquals(
      after.ok,
      true,
      "formatted output no longer parses cleanly",
    );
    assertEquals(after.tree, before.tree, "formatting changed the AST");
  });
}
