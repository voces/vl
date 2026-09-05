// `std:json` against the RFC 8259 grammar's edges, the I-JSON refusals the
// module's header promises, and the platform's own JSON as the oracle.
//
// THE ORACLE IS `JSON.parse` / `JSON.stringify`, not a second implementation
// written here to agree with the first. Where the two are SPECIFIED to agree —
// compact rendering of a finite number, the escape set, key order, the
// grammar's accept/reject boundary — the platform's answer is the expected
// value and this file does not restate it. Where they are specified to DIFFER
// the difference is listed once, in `ORACLE_DIVERGENCES` below, with the
// module header's reason; every such case is then asserted against the module's
// documented answer rather than against the oracle.
//
// The `vl_` prefix is load-bearing: it is one of the globs `ci-native`
// auto-discovers (tests/ci_seed_coverage_test.ts), and a seed-backed test
// matching neither glob nor an explicit ci.yml step runs nowhere in CI.
//
// GATING: env-gated (`SELFHOST_NATIVE_ALIGN=1`) AND requires the built binary +
// seed wasm, so it self-ignores on a fresh clone and runs in `ci-native`.

import { COMPILER, ROOT, VL, exists } from "./support/tree.ts";

const STD = `${ROOT}/std`;

const GATED = Deno.env.get("SELFHOST_NATIVE_ALIGN") === "1";
const ENABLED = GATED && exists(VL) && exists(COMPILER);
if (GATED && !ENABLED) {
  console.warn("[vl-std-json] skipped — missing vl binary or seed wasm.");
}

const run = async (
  src: (dir: string) => string,
  extra: Record<string, string> = {},
): Promise<string[]> => {
  const dir = await Deno.makeTempDir({ prefix: "vl_json_" });
  try {
    const entry = `${dir}/probe.vl`;
    await Deno.writeTextFile(entry, src(dir));
    for (const [name, text] of Object.entries(extra)) {
      await Deno.writeTextFile(`${dir}/${name}`, text);
    }
    const { code, stdout, stderr } = await new Deno.Command(VL, {
      args: ["run", entry, "--compiler", COMPILER],
      stdout: "piped",
      stderr: "piped",
      // VL_STD pins the std dir to THIS tree — see tests/vl_std_args_test.ts.
      env: { RUST_BACKTRACE: "0", NO_COLOR: "1", VL_STD: STD },
    }).output();
    const dec = new TextDecoder();
    const out = dec.decode(stdout);
    if (code !== 0) {
      throw new Error(
        `\`vl run\` exited ${code}\nstdout:\n${out}\nstderr:\n${dec.decode(stderr)}`,
      );
    }
    return out.split("\n").slice(0, -1);
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
};

// Cases cross into the VL program through a FILE, one per line, each prefixed
// with `>` so a case that is itself empty still occupies a line. The same
// carrier `tests/vl_std_base64_test.ts` uses, for the same reason: nothing
// about the comparison then depends on VL's own literal escaping.
//
// Every case is written as JS-escaped text and the file holds the RAW bytes, so
// a case containing a newline or a NUL cannot be expressed this way. The two
// that need one (a raw control character inside a string) use a `~X~`-style
// marker the probe expands — `~T~` for a tab and `~N~` for a newline — which is
// spelled out here rather than in the probe so the expansion is visible beside
// the case that needs it.
const encodeCase = (s: string): string =>
  s.replace(/\t/g, "~T~").replace(/\n/g, "~N~").replace(/\r/g, "~R~");

const casesFile = (cases: string[]): string =>
  cases.map((c) => ">" + encodeCase(c)).join("\n") + "\n";

// The probe: read one case per line, parse it, and print a single line per
// case. On success it prints the RE-RENDERED document, which makes every
// success line a statement about both directions at once. On failure it prints
// the kind, the byte offset and the pointer.
const PARSE_SRC = (dir: string) => `import { Json, JsonError, parseJson, toJson } from "std:json"
import { IoError, readTextFile } from "std:fs"
import { replaceAll } from "std:str"
import { toString } from "std:fmt"

// The markers the harness uses for bytes a one-line-per-case file cannot hold.
function expand(s: string): string {
  const a = s.replaceAll("~T~", "\\t")
  const b = a.replaceAll("~N~", "\\n")
  b.replaceAll("~R~", "\\r")
}

function rend(v: Json): string {
  const t = toJson(v)
  if t is JsonError {
    return "RENDER " + t.kind + " " + toString(t.at) + " " + t.path
  }
  "OK " + t
}

const txt = readTextFile("${dir}/cases.txt")
if txt is IoError {
  print("IOERR " + txt.msg)
} else {
  let start = 0
  while start < txt.length {
    let end = start
    while end < txt.length && txt[end] != 10 { end = end + 1 }
    const s = expand(txt.slice(start + 1, end))
    const r = parseJson(s)
    if r is JsonError {
      print("PARSE " + r.kind + " " + toString(r.at) + " " + r.path)
    } else {
      // Six-way re-delivery: a narrowed arm reaches a \`Json\` destination at
      // its own spelling, and the map arm is re-bound at the arm's type first
      // (D1029). This is the consumer idiom \`json-design.md\` §2.8 shows.
      if r is boolean { print(rend(r)) }
      if r is f64 { print(rend(r)) }
      if r is string { print(rend(r)) }
      if r is Json[] { print(rend(r)) }
      if r is { [string]: Json } {
        const o: { [string]: Json } = r
        print(rend(o))
      }
      if r is null { print(rend(null)) }
    }
    start = end + 1
  }
}
`;

/**
 * Inputs where the module is SPECIFIED to differ from the platform, each with
 * the reason from `std/json.vl`'s header. Listed here so the oracle comparison
 * below can be exhaustive over everything else rather than silently skipping.
 */
const ORACLE_DIVERGENCES: Record<string, string> = {
  "-0": "JS renders -0 as 0; the module keeps the sign (Go/serde/Python agree)",
  "1e999": "JS parses to Infinity and renders null; the module refuses at parse",
  '{"a":1,"a":2}': "JS takes last-wins; the module refuses duplicates (I-JSON)",
  '"\\ud800"': "JS accepts a lone surrogate; the module refuses it (I-JSON)",
  '"\\udc00"': "JS accepts a lone low surrogate; the module refuses it (I-JSON)",
  '"\\ud800\\ud800"': "two highs: JS accepts, the module refuses",
  "\uFEFF{}": "a leading BOM: JS refuses too, but the module names it in msg",
};

Deno.test({
  // The grammar boundary, graded against `JSON.parse` itself: for every input
  // the platform accepts the module must accept, and for every input it
  // rejects the module must reject. The listed divergences are the only
  // exceptions and each is asserted separately below.
  name: "std:json: parseJson accepts exactly what JSON.parse does",
  ignore: !ENABLED,
  fn: async () => {
    const cases = [
      // accepted by the grammar
      "null",
      "true",
      "false",
      "0",
      "-0",
      "1",
      "-1",
      "1.5",
      "-1.5",
      "1e2",
      "1E2",
      "1e+2",
      "1e-2",
      "1.5e3",
      "0.5",
      "123456789",
      "9007199254740993",
      "1e-7",
      "1e21",
      '""',
      '"a"',
      '"a\\"b"',
      '"a\\\\b"',
      '"a\\/b"',
      '"\\b\\f\\n\\r\\t"',
      '"\\u0041"',
      '"\\u00e9"',
      '"\\ud83d\\ude00"',
      '"aé€😀"',
      "[]",
      "{}",
      "[1]",
      "[1,2,3]",
      '{"a":1}',
      '{"a":1,"b":2}',
      '{"a":{"b":[1,2,{"c":null}]}}',
      "[[[[[1]]]]]",
      " 1 ",
      "\t1\t",
      "\n1\n",
      "\r1\r",
      " \t\r\n [ 1 , 2 ] \t\r\n ",
      '{ "a" : 1 }',
      "[null,true,false]",
      '{"":1}',
      '{"a/b":1}',
      '{"a~b":1}',
      // rejected by the grammar
      "",
      "   ",
      "01",
      "-01",
      "+1",
      ".5",
      "1.",
      "1.e5",
      "1e",
      "1e+",
      "00",
      "0x10",
      "Infinity",
      "NaN",
      "nul",
      "tru",
      "[1,]",
      "[,1]",
      "[1 2]",
      "{,}",
      '{"a":1,}',
      '{"a"}',
      '{"a":}',
      "{a:1}",
      "{'a':1}",
      "'a'",
      "[1,2",
      '{"a":1',
      '"unterminated',
      "{} x",
      "1 2",
      "[] []",
      "// comment",
      "[1] // c",
      '"\\x41"',
      '"\\u00"',
      '"\\uZZZZ"',
      "\v1",
      "\f1",
      " 1",
    ];
    const lines = await run(PARSE_SRC, { "cases.txt": casesFile(cases) });
    if (lines.length !== cases.length) {
      throw new Error(`want ${cases.length} answers, got ${lines.length}: ${lines[0]}`);
    }
    const bad: string[] = [];
    for (let i = 0; i < cases.length; i++) {
      const input = cases[i];
      if (input in ORACLE_DIVERGENCES) continue;
      let oracleOk = true;
      try {
        JSON.parse(input);
      } catch {
        oracleOk = false;
      }
      const vlOk = lines[i].startsWith("OK ");
      if (oracleOk !== vlOk) {
        bad.push(
          `${JSON.stringify(input)}: JSON.parse ${oracleOk ? "accepts" : "rejects"}, ` +
            `parseJson ${vlOk ? "accepts" : "rejects"} (${lines[i]})`,
        );
      }
    }
    if (bad.length > 0) {
      throw new Error(`${bad.length} disagreed with the oracle:\n  ` + bad.join("\n  "));
    }
  },
});

Deno.test({
  // Rendering, graded against `JSON.stringify` on the tree the platform itself
  // parsed. This is the round trip that matters: parse ∘ render must agree
  // with the platform's own parse ∘ render, character for character, so key
  // ORDER, number formatting and the escape set are all covered by one
  // comparison rather than three hand-written expectations.
  name: "std:json: parse then render matches JSON.stringify(JSON.parse(x))",
  ignore: !ENABLED,
  fn: async () => {
    const cases = [
      "null",
      "true",
      "false",
      "0",
      "1",
      "-1",
      "1.0",
      "1.5",
      "-1.5",
      "100",
      "1e2",
      "1e21",
      "1e-7",
      "1e20",
      "0.1",
      "0.30000000000000004",
      "123456789012345680000",
      "5e-324",
      "1.7976931348623157e308",
      "9007199254740992",
      '""',
      '"a"',
      '"a\\"b"',
      '"a\\\\b"',
      '"a\\/b"',
      '"\\b"',
      '"\\f"',
      '"\\n"',
      '"\\r"',
      '"\\t"',
      '"\\u0000"',
      '"\\u0001"',
      '"\\u001f"',
      '"\\u0020"',
      '"\\u007f"',
      '"\\u0041"',
      '"\\u00e9"',
      '"\\u20ac"',
      '"\\ud83d\\ude00"',
      '"aé€😀"',
      "[]",
      "{}",
      "[1,2,3]",
      '["a","b"]',
      '{"a":1,"b":2}',
      '{"b":1,"a":2,"c":3}',
      '{"z":1,"y":{"x":[1,{"w":null}]}}',
      "[[[[[1]]]]]",
      '{"a":[],"b":{}}',
      '[null,true,false,"s",1.5,[],{}]',
      '{"a/b":1,"a~b":2}',
      " [ 1 , 2 ] ",
    ];
    const lines = await run(PARSE_SRC, { "cases.txt": casesFile(cases) });
    if (lines.length !== cases.length) {
      throw new Error(`want ${cases.length} answers, got ${lines.length}: ${lines[0]}`);
    }
    const bad: string[] = [];
    for (let i = 0; i < cases.length; i++) {
      const want = "OK " + JSON.stringify(JSON.parse(cases[i]));
      if (lines[i] !== want) {
        bad.push(`${JSON.stringify(cases[i])} want=${want} got=${lines[i]}`);
      }
    }
    if (bad.length > 0) {
      throw new Error(`${bad.length} render mismatches:\n  ` + bad.join("\n  "));
    }
  },
});

Deno.test({
  // The documented divergences from the platform, each asserted against the
  // module's own promise. These are the cases the oracle test skips, so this
  // is where they are pinned — an unasserted divergence is an untested one.
  name: "std:json: the documented divergences from the platform hold",
  ignore: !ENABLED,
  fn: async () => {
    const cases: [string, string][] = [
      // `-0` keeps its sign where JSON.stringify(-0) is "0".
      ["-0", "OK -0"],
      ["[-0]", "OK [-0]"],
      ['{"a":-0}', 'OK {"a":-0}'],
      // A number outside double range is refused at PARSE, not rendered null.
      ["1e999", "PARSE nonfinite 0 "],
      ["-1e999", "PARSE nonfinite 0 "],
      ["[1,1e999]", "PARSE nonfinite 3 "],
      // Underflow stays silent — 0 is finite and renders.
      ["1e-999", "OK 0"],
      // Duplicate member names are refused, `at` at the SECOND occurrence.
      ['{"a":1,"a":2}', "PARSE duplicate 7 "],
      ['{"a":1,"b":2,"a":3}', "PARSE duplicate 13 "],
      ['{"x":{"a":1,"a":2}}', "PARSE duplicate 12 /x"],
      // Lone surrogates are refused; a PAIR decodes to one code point.
      ['"\\ud800"', "PARSE syntax 1 "],
      ['"\\udc00"', "PARSE syntax 1 "],
      ['"\\ud800\\ud800"', "PARSE syntax 1 "],
      ['"\\ud800x"', "PARSE syntax 1 "],
      ['"\\udc00\\ud800"', "PARSE syntax 1 "],
      ['"\\ud83d\\ude00"', 'OK "😀"'],
      // A leading BOM is refused at 0.
      ["\uFEFF{}", "PARSE syntax 0 "],
      ["\uFEFF", "PARSE syntax 0 "],
    ];
    const lines = await run(PARSE_SRC, { "cases.txt": casesFile(cases.map(([c]) => c)) });
    if (lines.length !== cases.length) {
      throw new Error(`want ${cases.length} answers, got ${lines.length}: ${lines[0]}`);
    }
    const bad: string[] = [];
    for (let i = 0; i < cases.length; i++) {
      if (lines[i] !== cases[i][1]) {
        bad.push(`${JSON.stringify(cases[i][0])} want=${cases[i][1]} got=${lines[i]}`);
      }
    }
    if (bad.length > 0) {
      throw new Error(`${bad.length} divergences were wrong:\n  ` + bad.join("\n  "));
    }
  },
});

Deno.test({
  // Every `kind` with the `at` and `path` the header promises. `at` is a BYTE
  // offset, so the non-ASCII rows are the ones that would catch a code-point
  // count; `path` is the pointer to the CONTAINER being read, so the nested
  // rows are the ones that would catch a value-pointer.
  name: "std:json: parse errors carry the promised kind, byte offset and pointer",
  ignore: !ENABLED,
  fn: async () => {
    const cases: [string, string][] = [
      // syntax, at the offending byte, path "" before any container
      ["@", "PARSE syntax 0 "],
      ["", "PARSE syntax 0 "],
      ["   ", "PARSE syntax 3 "],
      ["\t\r\n ", "PARSE syntax 4 "],
      ["{} x", "PARSE syntax 3 "],
      ["1 @", "PARSE syntax 2 "],
      ["[1,2", "PARSE syntax 4 "],
      ["01", "PARSE syntax 0 "],
      ["-01", "PARSE syntax 1 "],
      ["1.", "PARSE syntax 2 "],
      ["1e+", "PARSE syntax 3 "],
      // a raw control character inside a string
      ['"a\tb"', "PARSE syntax 2 "],
      ['"a\nb"', "PARSE syntax 2 "],
      // the byte offset is a BYTE offset, not a code point count
      ['["é€",@]', "PARSE syntax 9 "],
      ['{"é":@}', "PARSE syntax 6 "],
      // path names the CONTAINER being read
      ["[1,@]", "PARSE syntax 3 "],
      ['{"a":@}', "PARSE syntax 5 "],
      ['{"a":[@]}', "PARSE syntax 6 /a"],
      ['{"a":{"b":@}}', "PARSE syntax 10 /a"],
      ['{"users":[{"n":1},{"n":@}]}', "PARSE syntax 23 /users/1"],
      ['[[[@]]]', "PARSE syntax 3 /0/0"],
      // RFC 6901 escaping in a pointer segment
      ['{"a~b":{"x":@}}', "PARSE syntax 12 /a~0b"],
      ['{"a/b":{"x":@}}', "PARSE syntax 12 /a~1b"],
      ['{"~/":{"x":@}}', "PARSE syntax 11 /~0~1"],
    ];
    const lines = await run(PARSE_SRC, { "cases.txt": casesFile(cases.map(([c]) => c)) });
    if (lines.length !== cases.length) {
      throw new Error(`want ${cases.length} answers, got ${lines.length}: ${lines[0]}`);
    }
    const bad: string[] = [];
    for (let i = 0; i < cases.length; i++) {
      if (lines[i] !== cases[i][1]) {
        bad.push(`${JSON.stringify(cases[i][0])} want=${cases[i][1]} got=${lines[i]}`);
      }
    }
    if (bad.length > 0) {
      throw new Error(`${bad.length} error reports were wrong:\n  ` + bad.join("\n  "));
    }
  },
});

// Render-side probe: build a tree in VL, render it, print the answer. Each
// case is a numbered branch so the tree can hold values no JSON text can
// produce (NaN, an infinity, a cycle) — which is the whole point, since those
// are exactly the trees `toJson` has to refuse.
const RENDER_SRC = () => `import { Json, JsonError, toJson } from "std:json"
import { toString } from "std:fmt"

function show(v: Json): string {
  const t = toJson(v)
  if t is JsonError {
    return "ERR " + t.kind + " " + toString(t.at) + " " + t.path
  }
  "OK " + t
}

// A list nested \`n\` deep: [[[…]]].
function nest(n: i32): Json {
  let cur: Json[] = []
  let i = 0
  while i < n - 1 {
    let outer: Json[] = []
    outer.push(cur)
    cur = outer
    i = i + 1
  }
  cur
}

const nan = 0.0 / 0.0
const inf = 1.0 / 0.0

// 0: NaN at the root
print(show(nan))
// 1: +Infinity at the root
print(show(inf))
// 2: -Infinity at the root
print(show(0.0 - inf))
// 3: NaN at /a/2 — the nested pointer the header promises
let three: Json[] = []
three.push(1.0)
three.push(2.0)
three.push(nan)
let o3: { [string]: Json } = Map()
o3["a"] = three
print(show(o3))
// 4: an infinity under a key needing RFC 6901 escaping
let o4: { [string]: Json } = Map()
o4["a~b"] = inf
print(show(o4))
// 5: and under a key with a slash
let o5: { [string]: Json } = Map()
o5["a/b"] = inf
print(show(o5))
// 6: -0 survives the tree (the literal carries the sign; \`0.0 - 0.0\` is +0)
print(show(-0.0))
// 7: a list holding -0
let seven: Json[] = []
seven.push(-0.0)
print(show(seven))
// 8: exactly at the depth cap
print(show(nest(128)))
// 9: one past it
print(show(nest(129)))
// 10: a self-containing LIST is \`depth\`, not a trap
let cyc: Json[] = []
cyc.push(cyc)
print(show(cyc))
// 11: a self-containing MAP is \`depth\`, not a trap
let mcyc: { [string]: Json } = Map()
mcyc["self"] = mcyc
print(show(mcyc))
// 12: a cycle one level down still reports, and still does not trap
let inner: Json[] = []
inner.push(inner)
let outer12: { [string]: Json } = Map()
outer12["k"] = inner
print(show(outer12))
// 13: every escape the renderer emits, in one string
const cps: i32[] = []
cps.push(34)
cps.push(92)
cps.push(8)
cps.push(9)
cps.push(10)
cps.push(12)
cps.push(13)
cps.push(0)
cps.push(1)
cps.push(31)
cps.push(47)
print(show(fromCodePoints(cps)))
// 14: non-ASCII is emitted RAW
print(show("aé€😀"))
// 15: insertion order survives a delete and a re-insert
let o15: { [string]: Json } = Map()
o15["b"] = 1.0
o15["a"] = 2.0
o15["c"] = 3.0
o15.delete("a")
o15["a"] = 4.0
print(show(o15))
// 16: 2^53 + 1 rounds, and renders as the even neighbour
print(show(9007199254740993.0))
// 17: 1e21 and 1e-7 take their exponent forms
let o17: Json[] = []
o17.push(1e21)
o17.push(1e-7)
print(show(o17))
`;

Deno.test({
  // What only a program-built tree can hold: the non-finite numbers, a cycle,
  // and the depth cap from the render side. The cycle rows are the ones that
  // would TRAP without the cap — `json-design.md` §4 measured a naive walk as
  // `wasm trap: call stack exhausted` — so a passing run here is also the
  // evidence that the cap is doing its job.
  name: "std:json: toJson refuses non-finite and over-deep trees without trapping",
  ignore: !ENABLED,
  fn: async () => {
    const lines = await run(RENDER_SRC);
    const escapes = JSON.stringify('"\\\b\t\n\f\r\u0000\u0001\u001f/');
    const want = [
      "ERR nonfinite 0 ",
      "ERR nonfinite 0 ",
      "ERR nonfinite 0 ",
      "ERR nonfinite 0 /a/2",
      "ERR nonfinite 0 /a~0b",
      "ERR nonfinite 0 /a~1b",
      "OK -0",
      "OK [-0]",
      "OK " + "[".repeat(128) + "]".repeat(128),
      "ERR depth 0 " + "/0".repeat(128),
      "ERR depth 0 " + "/0".repeat(128),
      "ERR depth 0 " + "/self".repeat(128),
      "ERR depth 0 /k" + "/0".repeat(127),
      // The escape set is the platform's, since JSON.stringify of the same
      // characters is the specification both implement.
      "OK " + escapes,
      'OK "aé€😀"',
      // Insertion order after delete + re-insert: `b c a`, not `b a c`.
      'OK {"b":1,"c":3,"a":4}',
      "OK " + JSON.stringify(9007199254740993),
      "OK " + JSON.stringify([1e21, 1e-7]),
    ];
    if (lines.length !== want.length) {
      throw new Error(`want ${want.length} lines, got ${lines.length}:\n${lines.join("\n")}`);
    }
    const bad: string[] = [];
    for (let i = 0; i < want.length; i++) {
      if (lines[i] !== want[i]) bad.push(`case ${i}: want=${want[i]} got=${lines[i]}`);
    }
    if (bad.length > 0) {
      throw new Error(`${bad.length} render answers were wrong:\n  ` + bad.join("\n  "));
    }
  },
});

Deno.test({
  // Depth on the PARSE side: 128 nested containers is accepted and 129 is
  // refused, for both container kinds and for a mixture of the two, so the cap
  // counts CONTAINERS and not brackets of one shape.
  name: "std:json: parseJson accepts 128 levels and refuses 129",
  ignore: !ENABLED,
  fn: async () => {
    const arr = (n: number) => "[".repeat(n) + "]".repeat(n);
    const obj = (n: number) => '{"a":'.repeat(n) + "1" + "}".repeat(n);
    const mix = (n: number) => {
      let s = "";
      let close = "";
      for (let i = 0; i < n; i++) {
        if (i % 2 === 0) {
          s += "[";
          close = "]" + close;
        } else {
          s += '{"a":';
          close = "}" + close;
        }
      }
      return s + "1" + close;
    };
    const cases: [string, boolean][] = [
      [arr(1), true],
      [arr(127), true],
      [arr(128), true],
      [arr(129), false],
      [arr(200), false],
      [obj(128), true],
      [obj(129), false],
      [mix(128), true],
      [mix(129), false],
    ];
    const lines = await run(PARSE_SRC, { "cases.txt": casesFile(cases.map(([c]) => c)) });
    if (lines.length !== cases.length) {
      throw new Error(`want ${cases.length} answers, got ${lines.length}: ${lines[0]}`);
    }
    const bad: string[] = [];
    for (let i = 0; i < cases.length; i++) {
      const [input, ok] = cases[i];
      const got = lines[i];
      if (ok && !got.startsWith("OK ")) {
        bad.push(`depth-${i} (len ${input.length}) should parse, got ${got.slice(0, 60)}`);
      }
      if (!ok && !got.startsWith("PARSE depth ")) {
        bad.push(`depth-${i} (len ${input.length}) should be depth, got ${got.slice(0, 60)}`);
      }
    }
    if (bad.length > 0) {
      throw new Error(`${bad.length} depth answers were wrong:\n  ` + bad.join("\n  "));
    }
  },
});

Deno.test({
  // A round-trip property over a deterministic generator: for every tree the
  // generator produces, `render` is a FIXPOINT of `parse ∘ render`. That is
  // the invariant `json-design.md` §1 states — every tree `parseJson` returns,
  // `toJson` renders — and it is checked here on documents no hand-written
  // case list would think to write. The oracle is applied too: the module's
  // rendering must equal the platform's for the same document.
  name: "std:json: parse ∘ render is a fixpoint on the rendered text",
  ignore: !ENABLED,
  fn: async () => {
    // xorshift32 over 32-bit integer ops — exact in a Number, so the sequence
    // is the same on every platform without reaching for BigInt.
    let s = 0x1a2b3c4d;
    const next = (): number => {
      s ^= s << 13;
      s ^= s >>> 17;
      s ^= s << 5;
      s >>>= 0;
      return s;
    };
    const KEYS = ["a", "b", "z", "", "a/b", "a~b", "é", "k k", "0"];
    const STRS = ["", "x", 'q"q', "back\\slash", "tab\tsep", "nl\nsep", "é€😀", "\u0001\u001f"];
    const NUMS = [0, 1, -1, 1.5, -1.5, 1e21, 1e-7, 0.1, 100, -0, 9007199254740992, 5e-324];
    const gen = (depth: number): unknown => {
      const r = next() % (depth > 3 ? 5 : 8);
      if (r === 0) return null;
      if (r === 1) return (next() & 1) === 0;
      if (r === 2) return NUMS[next() % NUMS.length];
      if (r === 3) return STRS[next() % STRS.length];
      if (r === 4) return STRS[next() % STRS.length];
      if (r === 5 || r === 6) {
        const n = next() % 4;
        const a: unknown[] = [];
        for (let i = 0; i < n; i++) a.push(gen(depth + 1));
        return a;
      }
      const n = next() % 4;
      const o: Record<string, unknown> = {};
      for (let i = 0; i < n; i++) o[KEYS[next() % KEYS.length]] = gen(depth + 1);
      return o;
    };
    const docs: string[] = [];
    for (let i = 0; i < 300; i++) docs.push(JSON.stringify(gen(0)));
    // `-0` is the one value whose JSON.stringify text the module does not
    // reproduce, and the generator can emit it; it is asserted separately, so
    // drop the documents that contain it rather than weaken the comparison.
    const cases = docs.filter((d) => !/-0(?![.\d])/.test(d));
    if (cases.length < 200) {
      throw new Error(`generator produced only ${cases.length} usable documents`);
    }
    const lines = await run(PARSE_SRC, { "cases.txt": casesFile(cases) });
    if (lines.length !== cases.length) {
      throw new Error(`want ${cases.length} answers, got ${lines.length}: ${lines[0]}`);
    }
    const bad: string[] = [];
    for (let i = 0; i < cases.length; i++) {
      if (lines[i] !== "OK " + cases[i]) {
        bad.push(`${cases[i].slice(0, 60)} -> ${lines[i].slice(0, 70)}`);
      }
    }
    if (bad.length > 0) {
      throw new Error(
        `${bad.length} of ${cases.length} round trips lost the document:\n  ` +
          bad.slice(0, 10).join("\n  "),
      );
    }
    // The fixpoint half: feeding the module's OWN output back in must produce
    // it again unchanged. The first pass already equals JSON.stringify, so a
    // second pass over the same text is the fixpoint check.
    const again = await run(PARSE_SRC, {
      "cases.txt": casesFile(lines.map((l) => l.slice(3))),
    });
    const moved: string[] = [];
    for (let i = 0; i < again.length; i++) {
      if (again[i] !== lines[i]) moved.push(`${lines[i].slice(0, 60)} -> ${again[i].slice(0, 60)}`);
    }
    if (moved.length > 0) {
      throw new Error(
        `${moved.length} documents were not a fixpoint:\n  ` + moved.slice(0, 10).join("\n  "),
      );
    }
  },
});
