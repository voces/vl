// D9 slot 8 — the pure half of the VS Code Testing API integration
// (`lsp/src/testDiscovery.ts`): the `describe`/`it`/`itSkip` scanner, the `-t`
// filter plan, and the `vl test` report parser.
//
// Pure by construction — no `vscode`, no seed, no child process — so this file
// runs in the `ci` job under `deno task test` and needs no `ci-native` wiring
// (`ci_seed_coverage_test.ts` classifies a test as seed-backed only if it names
// `vl-compiler.wasm` AND gates on its presence; this one does neither).
//
// The report fixtures below are the runner's REAL output, captured from
// `vl test` on 2026-09-01 (seed 5446e243, `dist/vl` of the same build) rather
// than retyped from cli.vl — a paraphrased witness is a different program.

import {
  discoverTests,
  failureAnchor,
  failureLocation,
  filterFor,
  flattenTests,
  leafPaths,
  parseTestReport,
  planFileRun,
  type RunTarget,
  selectedPaths,
  stripAnsi,
  substringPaths,
} from "../lsp/src/testDiscovery.ts";

const eq = (got: unknown, want: unknown, what: string): void => {
  const g = JSON.stringify(got);
  const w = JSON.stringify(want);
  if (g !== w) throw new Error(`${what}\n  want ${w}\n  got  ${g}`);
};

// ---- discovery ---------------------------------------------------------------

Deno.test("discovery: nested describes build the runner's own ` > ` paths", () => {
  const src = `import { describe, expect, it, itSkip, toEqual } from "std:test"

describe("outer", () => {
  it("adds", () => {
    expect(1 + 1).toEqual(2)
  })
  describe("inner", () => {
    it("fails here", () => {
      expect(3).toEqual(4)
    })
    itSkip("skipped one", () => {
      expect(1).toEqual(2)
    })
  })
})

it("top level", () => {
  expect("x").toEqual("x")
})
`;
  const tree = discoverTests(src);
  eq(tree.map((n) => n.kind), ["describe", "it"], "top-level kinds");
  eq(
    leafPaths(tree),
    [
      "outer > adds",
      "outer > inner > fails here",
      "outer > inner > skipped one",
      "top level",
    ],
    "registered paths, in registration order",
  );
  eq(
    flattenTests(tree).map((n) => n.kind),
    ["describe", "it", "describe", "it", "itSkip", "it"],
    "every node, depth-first",
  );
  // `describe` scopes are NOT registered names — only its leaves are.
  eq(tree[0].path, "outer", "a describe's path is the prefix it contributes");
});

Deno.test("discovery: an `it`'s range starts on its own line (the gutter icon)", () => {
  const src = `import { it } from "std:test"\n\nit("adds", () => {\n})\n`;
  const [node] = discoverTests(src);
  eq(node.range.start, { line: 2, character: 0 }, "range starts at the `it`");
  // The range ends at the closing quote of the name, so the selection covers
  // `it("adds"` and nothing of the body.
  eq(node.range.end, { line: 2, character: 9 }, "range ends after the name");
});

Deno.test("discovery: the formatter's one-line form nests correctly", () => {
  // `vl fmt`'s trailing-lambda exception hugs `it("name", () => { … })`, so a
  // whole suite can live on one line. Paren depth — not brace depth — is what
  // closes the describe.
  const src =
    `describe("a", () => { it("b", () => {}) }); it("c", () => {}); describe("d", () => { describe("e", () => { it("f", () => {}) }) })`;
  eq(
    leafPaths(discoverTests(src)),
    ["a > b", "c", "d > e > f"],
    "one-line describes close at their own `)`",
  );
});

Deno.test("discovery: a name may hold braces, quotes and escapes", () => {
  const src = [
    `it("a } brace {", () => {})`,
    `it("a \\"quoted\\" name", () => {})`,
    `it("tab\\there", () => {})`,
    `it("hex \\x41 and \\u0042 and \\u{1F600}", () => {})`,
    `it("unknown \\q escape", () => {})`,
    `it("continued \\`,
    `line", () => {})`,
  ].join("\n");
  eq(
    leafPaths(discoverTests(src)),
    [
      "a } brace {",
      'a "quoted" name',
      "tab\there",
      "hex A and B and \u{1F600}",
      "unknown q escape",
      "continued line",
    ],
    "decoded exactly as compiler/lexer.vl decodes them",
  );
});

Deno.test("discovery: a name holding a brace does not swallow the next test", () => {
  // The failure mode a brace-depth scanner has: `"{"` opens a phantom scope.
  const src = `describe("with { brace", () => {\n  it("inside", () => {})\n})\nit("after", () => {})\n`;
  eq(
    leafPaths(discoverTests(src)),
    ["with { brace > inside", "after"],
    "the sibling after the describe stays at file scope",
  );
});

Deno.test("discovery: `it` that is not a registration call is ignored", () => {
  const src = [
    `function it(name: string, body: () => void) {}`, // a declaration
    `const it = 3`, // a binding
    `suite.it("member call")`, // somebody else's `it`
    `xs[it]("indexed")`, // an index, then a call
    `it(name, () => {})`, // a dynamic name — invisible to a static scan
    `it("real", () => {})`, // the only registration here
  ].join("\n");
  eq(
    leafPaths(discoverTests(src)),
    ["real"],
    "only `ident ( \"literal\"` registers",
  );
});

Deno.test("discovery: commented-out tests do not register", () => {
  const src = [
    `// it("dead", () => {})`,
    `it("live", () => {}) // it("trailing", () => {})`,
    `/// it("doc comment", () => {})`,
    `describe("scope", () => {`,
    `  // it("dead inside", () => {})`,
    `  it("live inside", () => {})`,
    `})`,
  ].join("\n");
  eq(
    leafPaths(discoverTests(src)),
    ["live", "scope > live inside"],
    "`//` and `///` comments are skipped whole",
  );
});

Deno.test("discovery: a char literal holding a quote does not derail the scan", () => {
  const src = `const q = '"'\nit("after the char literal", () => {})\n`;
  eq(
    leafPaths(discoverTests(src)),
    ["after the char literal"],
    "`'\"'` is a char literal, not the start of a string",
  );
});

Deno.test("discovery: an unterminated string does not hang or mis-scope", () => {
  const src = `it("unterminated\nit("after", () => {})\n`;
  // The unterminated literal ends at the newline (as it does in the lexer), so
  // the next line is scanned normally.
  eq(leafPaths(discoverTests(src)), ["after"], "the scan recovers at the newline");
  eq(discoverTests("").length, 0, "an empty source discovers nothing");
});

Deno.test("discovery: a describe body ending early does not orphan later tests", () => {
  // Unbalanced parens (a file mid-edit). The open describe stays open — the
  // honest answer for a source that does not parse — but nothing crashes.
  const src = `describe("open", () => {\n  it("inside", () => {})\n`;
  eq(leafPaths(discoverTests(src)), ["open > inside"], "mid-edit source scans");
});

// ---- the `-t` plan -----------------------------------------------------------

const ALL = [
  "outer > adds",
  "outer > inner > fails here",
  "outer > inner > skipped one",
  "top level",
];

Deno.test("plan: one `it` runs under its own full path", () => {
  const specs = planFileRun(ALL, [{
    path: "outer > inner > fails here",
    kind: "it",
  }]);
  eq(specs.length, 1, "one spawn");
  eq(specs[0].filter, "outer > inner > fails here", "the `-t` argument");
  eq(specs[0].targetPaths, ["outer > inner > fails here"], "what it means");
  eq(specs[0].extraPaths, [], "nothing else matches that substring");
});

Deno.test("plan: a `describe` runs under `<path> > `, not the bare path", () => {
  const specs = planFileRun(ALL, [{ path: "outer > inner", kind: "describe" }]);
  eq(specs[0].filter, "outer > inner > ", "the separator anchors the scope");
  eq(
    specs[0].targetPaths,
    ["outer > inner > fails here", "outer > inner > skipped one"],
    "every leaf beneath it",
  );
  eq(specs[0].extraPaths, [], "and nothing above it");
});

Deno.test("plan: the trailing separator excludes a same-named sibling `it`", () => {
  // `describe("a")` and a top-level `it("a")` both spell "a". `-t "a"` would run
  // both; `-t "a > "` runs only the describe's leaves. This is the whole reason
  // the describe candidate is the longer string.
  const all = ["a > one", "a", "b"];
  const bare = substringPaths(all, "a");
  eq(bare, ["a > one", "a"], "the bare path over-runs");
  const { filter, extraPaths } = filterFor(all, { path: "a", kind: "describe" });
  eq(filter, "a > ", "the separator wins");
  eq(extraPaths, [], "the sibling `it` is excluded");
  // And running that sibling `it` is the ambiguous direction — see below.
  eq(
    selectedPaths(all, { path: "a", kind: "it" }),
    ["a"],
    "the `it` means only itself",
  );
});

Deno.test("plan: an ambiguous `it` name reports what its filter over-runs", () => {
  // `-t` is a SUBSTRING filter (`cliContains`), and an `it` has no handle longer
  // than its own path — so this run is genuinely generous, and says so.
  const all = ["adds", "outer > adds", "other"];
  const specs = planFileRun(all, [{ path: "adds", kind: "it" }]);
  eq(specs[0].filter, "adds", "the only available handle");
  eq(specs[0].targetPaths, ["adds"], "what was clicked");
  eq(specs[0].extraPaths, ["outer > adds"], "what comes along, reported not dropped");
});

Deno.test("plan: requesting every test drops `-t` entirely", () => {
  const targets: RunTarget[] = ALL.map((path) => ({ path, kind: "it" }));
  const specs = planFileRun(ALL, targets);
  eq(specs.length, 1, "one whole-file spawn");
  eq(specs[0].filter, undefined, "no filter at all");
  eq(specs[0].targetPaths, ALL, "covering the file");
  // The file-item request (no targets named) is the same run.
  eq(planFileRun(ALL, []), specs, "an empty request is the whole file");
});

Deno.test("plan: a requested describe absorbs its requested descendants", () => {
  const specs = planFileRun(ALL, [
    { path: "outer", kind: "describe" },
    { path: "outer > inner", kind: "describe" },
    { path: "outer > adds", kind: "it" },
  ]);
  eq(specs.length, 1, "one spawn, not three");
  eq(specs[0].filter, "outer > ", "the outermost requested scope");
});

Deno.test("plan: two unrelated roots are two spawns", () => {
  const specs = planFileRun(ALL, [
    { path: "outer > adds", kind: "it" },
    { path: "top level", kind: "it" },
  ]);
  eq(specs.length, 2, "one spawn per root");
  eq(
    specs.map((s) => s.filter),
    ["outer > adds", "top level"],
    "each under its own filter",
  );
});

Deno.test("plan: a duplicated name yields both registrations as targets", () => {
  // Two `it("dup")` in one scope register the same path twice; the report emits
  // two lines for it. Nothing here may silently pick one.
  const all = ["dup", "dup"];
  eq(
    selectedPaths(all, { path: "dup", kind: "it" }),
    ["dup", "dup"],
    "both registrations",
  );
});

// ---- the report parser -------------------------------------------------------

// Captured verbatim from `vl test <file>` (exit 1).
const REPORT = [
  "/tmp/vlt/sample.test.vl",
  "  ok   outer > adds",
  "  FAIL outer > inner > fails here",
  "       expected 3 to equal 4",
  "       --- captured output ---",
  "       a program print",
  "  skip outer > inner > skipped one",
  "  ok   top level",
  "1 file · 2 passed · 1 failed · 1 skipped",
  "",
].join("\n");

Deno.test("parse: the runner's report maps onto paths, outcomes and messages", () => {
  const r = parseTestReport(REPORT);
  eq(
    r.results.map((x) => [x.path, x.outcome]),
    [
      ["outer > adds", "passed"],
      ["outer > inner > fails here", "failed"],
      ["outer > inner > skipped one", "skipped"],
      ["top level", "passed"],
    ],
    "every status line",
  );
  eq(
    r.results[1].message,
    "expected 3 to equal 4\n--- captured output ---\na program print",
    "the indented block, de-indented and kept whole",
  );
  eq(r.results[0].message, undefined, "a passing test carries no message");
  eq(
    r.results[0].file,
    "/tmp/vlt/sample.test.vl",
    "results carry their file header",
  );
  eq(
    r.summary,
    { files: 1, passed: 2, failed: 1, skipped: 1 },
    "the summary line",
  );
  eq(r.unmatched, [], "nothing unclassified");
  eq(r.fileErrors, [], "no file-level failure");
});

Deno.test("parse: a summary without skips still parses", () => {
  const r = parseTestReport("f.vl\n  ok   a\n1 file · 1 passed · 0 failed\n");
  eq(r.summary, { files: 1, passed: 1, failed: 0, skipped: 0 }, "skipped = 0");
});

Deno.test("parse: `<compile>` is a FILE error, never a test result", () => {
  // Captured verbatim from `vl test tests/fixtures/vl-test`.
  const text = [
    "/x/broken.test.vl",
    "  FAIL <compile>",
    "       type error",
    "       /x/broken.test.vl: error [9:10] undeclared identifier 'noSuchName'",
    "1 file · 0 passed · 1 failed",
  ].join("\n");
  const r = parseTestReport(text);
  eq(r.results, [], "no test owns a compile failure");
  eq(r.fileErrors.length, 1, "one file error");
  eq(r.fileErrors[0].label, "<compile>", "the runner's sentinel");
  eq(r.fileErrors[0].file, "/x/broken.test.vl", "attributed to its file");
  eq(
    r.fileErrors[0].message,
    "type error\n/x/broken.test.vl: error [9:10] undeclared identifier 'noSuchName'",
    "the whole diagnostic block",
  );
});

Deno.test("parse: `<file top level>` is a file error too", () => {
  const r = parseTestReport(
    "/x/t.test.vl\n  FAIL <file top level>\n       wasm trap: unreachable\n",
  );
  eq(r.fileErrors[0].label, "<file top level>", "the second sentinel");
  eq(r.fileErrors[0].message, "wasm trap: unreachable", "its message");
  eq(r.results, [], "and no test results");
});

Deno.test("parse: `no tests` names the file the filter missed", () => {
  const r = parseTestReport(
    "/x/t.test.vl\n  no tests\n1 file · 0 passed · 0 failed\n",
  );
  eq(r.emptyFiles, ["/x/t.test.vl"], "the filter matched nothing there");
  eq(r.results, [], "and produced no results");
});

Deno.test("parse: captured output that looks like a status line is not one", () => {
  // A program under test printing `  ok   fake` lands at NINE columns inside the
  // failing test's block; a real status line has exactly two.
  const text = [
    "/x/t.test.vl",
    "  FAIL real",
    "       expected 1 to equal 2",
    "       --- captured output ---",
    "         ok   fake",
    "         FAIL also fake",
    "  ok   next",
    "1 file · 1 passed · 1 failed",
  ].join("\n");
  const r = parseTestReport(text);
  eq(
    r.results.map((x) => x.path),
    ["real", "next"],
    "two results, not four",
  );
  eq(
    r.results[0].message,
    "expected 1 to equal 2\n--- captured output ---\n  ok   fake\n  FAIL also fake",
    "the fakes stay inside the message, at their own indent",
  );
});

Deno.test("parse: an empty captured line survives inside a message", () => {
  const text = [
    "/x/t.test.vl",
    "  FAIL real",
    "       first",
    "       ",
    "       third",
    "  ok   next",
  ].join("\n");
  const r = parseTestReport(text);
  eq(r.results[0].message, "first\n\nthird", "the blank line is preserved");
});

Deno.test("parse: ANSI colour is stripped before classification", () => {
  const esc = "\u001b";
  const text = [
    `${esc}[1m/x/t.test.vl${esc}[0m`,
    `  ${esc}[32mok  ${esc}[0m a > b`,
    `  ${esc}[31mFAIL${esc}[0m c`,
    `       boom`,
    `${esc}[31m1 file · 1 passed · 1 failed${esc}[0m`,
  ].join("\n");
  eq(stripAnsi(`${esc}[31mx${esc}[0m`), "x", "the stripper itself");
  const r = parseTestReport(text);
  eq(
    r.results.map((x) => [x.path, x.outcome]),
    [["a > b", "passed"], ["c", "failed"]],
    "coloured lines classify identically",
  );
  eq(r.results[1].message, "boom", "and their blocks survive");
  eq(r.summary?.failed, 1, "as does the summary");
});

Deno.test("parse: a multi-file report attributes each result to its own file", () => {
  const text = [
    "/x/a.test.vl",
    "  ok   one",
    "/x/b.test.vl",
    "  ok   two",
    "2 files · 2 passed · 0 failed",
  ].join("\n");
  const r = parseTestReport(text);
  eq(
    r.results.map((x) => [x.file, x.path]),
    [["/x/a.test.vl", "one"], ["/x/b.test.vl", "two"]],
    "headers scope the lines beneath them",
  );
});

Deno.test("parse: lines the report does not own come back verbatim", () => {
  // An indented line with no failing test above it belongs to nobody — it is
  // handed to the run's output rather than guessed at.
  const r = parseTestReport("/x/t.test.vl\n       stray indented line\n  ok   a\n");
  eq(r.unmatched, ["       stray indented line"], "verbatim, indent included");
  eq(r.results.map((x) => x.path), ["a"], "and the real line still parses");
});

Deno.test("parse: empty input is an empty report, not a crash", () => {
  const r = parseTestReport("");
  eq(
    [r.results.length, r.fileErrors.length, r.unmatched.length, r.summary],
    [0, 0, 0, null],
    "nothing in, nothing out",
  );
});

// ---- the failure anchor (track-caller) ---------------------------------------
//
// `std:test`'s `expect` reports the call site it was written at, as a second line
// under the assertion sentence. This is the REAL fix D9 slot 12 named: the
// heuristic it supersedes could only ever anchor a body with exactly one
// `expect`, and could never reach a failure inside a HELPER file at all.
//
// Captured verbatim from `vl test hop.test.vl` (relative target, so the module
// keys are relative too) on 2026-09-01 — the fixture exercises all four hop
// shapes at once: a same-file helper that forwards its `caller`, one that does
// not, the same pair across a module boundary, and the `not()` chain.
const HOP_REPORT = [
  "hop.test.vl",
  "  FAIL same-file forwarding helper names its caller",
  "       expected 2 to equal 1",
  "         at hop.test.vl:15:3",
  "  FAIL same-file plain helper names its own expect",
  "       expected 2 to equal 1",
  "         at hop.test.vl:11:3",
  "  FAIL cross-file forwarding helper names its caller",
  "       expected 2 to equal 1",
  "         at hop.test.vl:23:3",
  "  FAIL cross-file plain helper names the HELPER file",
  "       expected 2 to equal 1",
  "         at helper.vl:10:3",
  "  FAIL the not() chain keeps the expect site",
  "       expected 1 not to equal 1",
  "         at hop.test.vl:31:3",
  "1 file · 0 passed · 5 failed",
  "",
].join("\n");

Deno.test("anchor: every failing expect carries the location it was written at", () => {
  const r = parseTestReport(HOP_REPORT);
  eq(
    r.results.map((x) => x.location),
    [
      { file: "hop.test.vl", line: 15, col: 3 },
      { file: "hop.test.vl", line: 11, col: 3 },
      { file: "hop.test.vl", line: 23, col: 3 },
      // ONE HOP: a helper that does not forward reports its OWN expect, which is
      // in another file entirely. No scan of the test body could have found it.
      { file: "helper.vl", line: 10, col: 3 },
      { file: "hop.test.vl", line: 31, col: 3 },
    ],
    "one location per failure, helper file included",
  );
  eq(
    r.results[0].message,
    "expected 2 to equal 1\n  at hop.test.vl:15:3",
    "the message stays WHOLE — the location line is kept, not consumed",
  );
});

Deno.test("anchor: a failure with no expect behind it carries no location", () => {
  // `fail(msg)` and a raw trap both reach the runner without one, and a
  // `<compile>` error is not a test result at all. Each must leave `location`
  // undefined so the caller falls back to the `it` line rather than guessing.
  const text = [
    "/x/t.test.vl",
    "  FAIL fails outright",
    "       no branch reached",
    "  FAIL traps outright",
    "       wasm trap: wasm `unreachable` instruction executed",
    "1 file · 0 passed · 2 failed",
  ].join("\n");
  const r = parseTestReport(text);
  eq(
    r.results.map((x) => x.location),
    [undefined, undefined],
    "no location invented for a message that has none",
  );
});

Deno.test("anchor: captured output cannot forge a location", () => {
  // The scan stops at the `--- captured output ---` sentinel, so a program that
  // prints a location-shaped line cannot move the anchor. This is why `std:test`
  // puts the location on its own line and the parser matches it ANCHORED: the
  // failure sentence itself ends in a rendered operand, which is user text.
  const text = [
    "/x/t.test.vl",
    "  FAIL real",
    "       expected 1 to equal 2",
    "         at real.vl:4:5",
    "       --- captured output ---",
    "         at forged.vl:99:99",
    "1 file · 0 passed · 1 failed",
  ].join("\n");
  const r = parseTestReport(text);
  eq(
    r.results[0].location,
    { file: "real.vl", line: 4, col: 5 },
    "the pre-sentinel location wins",
  );
});

Deno.test("anchor: a MULTI-LINE operand forges an anchored line, and loses anyway", () => {
  // Captured verbatim from `vl test forge.test.vl` on 2026-09-01. The witness
  // for why LAST-MATCH is the invariant and anchoring is not: a rendered string
  // operand is arbitrary user text, so it can put a perfectly anchored
  // `  at …:N:N` line INSIDE the assertion sentence. Being on its own line does
  // not distinguish std's from the forgery — being last does.
  //
  // The other half of that invariant lives in std/test.vl, which is the end that
  // can break it: nothing may be appended after the location line.
  const text = [
    "/p/forge.test.vl",
    "  FAIL operand forges an anchored line",
    '       expected "x',
    "         at /forged/file.vl:99:99",
    '       " to equal "y"',
    "         at /p/forge.test.vl:4:3",
    "1 file · 0 passed · 1 failed",
  ].join("\n");
  const r = parseTestReport(text);
  eq(
    r.results[0].location,
    { file: "/p/forge.test.vl", line: 4, col: 3 },
    "std:test's line is last, so std:test's line wins",
  );
});

Deno.test("anchor: an operand that reads like a location does not become one", () => {
  // `expect("at a.vl:1:1").toEqual("x")` renders the operand INSIDE the sentence,
  // which the anchored two-space match cannot mistake for std:test's own line.
  const one = failureLocation(
    'expected "at a.vl:1:1" to equal "x"\n  at real.vl:7:3',
  );
  eq(
    one,
    { file: "real.vl", line: 7, col: 3 },
    "the real line, not the operand",
  );
  // A `fail()` whose text happens to BE a location-shaped line: std:test's own
  // line always comes last in the failure text, so the last match wins.
  const two = failureLocation("  at decoy.vl:1:1\n  at real.vl:7:3");
  eq(two, { file: "real.vl", line: 7, col: 3 }, "the last match is std:test's");
  eq(
    failureLocation("expected 1 to equal 2"),
    undefined,
    "no line, no location",
  );
});

Deno.test("anchor: a Windows-style drive path survives the colon split", () => {
  // The file group is greedy, so `C:\x\t.test.vl:9:3` splits at the LAST two
  // colons rather than the drive's.
  eq(
    failureLocation("expected 1 to equal 2\n  at C:\\x\\t.test.vl:9:3"),
    { file: "C:\\x\\t.test.vl", line: 9, col: 3 },
    "drive letter kept with the path",
  );
});

// `failureAnchor` takes its resolver as a PARAMETER — joining and absoluteness
// are platform questions, and `testDiscovery.ts` imports nothing so it stays
// loadable under this file's own (root) deno config. A POSIX stub is all these
// cases need; the extension passes `node:path`'s `path.resolve`.
const posixResolve = (base: string, rel: string): string =>
  rel.startsWith("/") ? rel : `${base}/${rel}`;

Deno.test("anchor: a location resolves against the cwd the runner ran in", () => {
  // EVERY module key is spelled relative to the CWD — the entry's and a helper's
  // alike (measured 2026-09-01 with cwd and entry directory deliberately
  // different: `vl test sub/hop.test.vl` from the parent reports `sub/hop.test.vl`
  // AND `sub/helper.vl`). So both sides resolve the same way before comparison.
  const rel = failureAnchor(
    { file: "hop.test.vl", line: 15, col: 3 },
    "/w/tc",
    "hop.test.vl",
    posixResolve,
  );
  eq(
    rel,
    { file: "/w/tc/hop.test.vl", isTarget: true, line: 14, col: 2 },
    "the run's own file, in 0-based editor coordinates",
  );
  const helper = failureAnchor(
    { file: "helper.vl", line: 10, col: 3 },
    "/w/tc",
    "hop.test.vl",
    posixResolve,
  );
  eq(
    helper,
    { file: "/w/tc/helper.vl", isTarget: false, line: 9, col: 2 },
    "a helper file anchors in ITS file, not the test's",
  );
  // A nested target: the key carries the same `sub/` prefix the target does, so
  // the two still resolve equal. This is the shape the cwd measurement took.
  eq(
    failureAnchor(
      { file: "sub/hop.test.vl", line: 5, col: 3 },
      "/w",
      "sub/hop.test.vl",
      posixResolve,
    ).isTarget,
    true,
    "a target under a subdirectory is still the target",
  );
  // The absolute spelling the extension actually uses.
  eq(
    failureAnchor(
      { file: "/w/tc/hop.test.vl", line: 1, col: 1 },
      "/w",
      "/w/tc/hop.test.vl",
      posixResolve,
    ),
    { file: "/w/tc/hop.test.vl", isTarget: true, line: 0, col: 0 },
    "absolute target, absolute key, still the target",
  );
});

Deno.test("anchor: an unsaved buffer's MIRROR still counts as the target", () => {
  // A dirty buffer runs from `.t.vital-dirty.vl` beside the original, so the
  // module key names the mirror. `isTarget` is what tells the caller to map it
  // back to the document's uri instead of opening a dotfile the user never made.
  const at = failureAnchor(
    { file: "/w/.t.vital-dirty.vl", line: 5, col: 3 },
    "/w",
    "/w/.t.vital-dirty.vl",
    posixResolve,
  );
  eq(at.isTarget, true, "the mirror is the target");
});
