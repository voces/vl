// The `scripts/perf/*.vl` profiling tools, held to fixed output over hand-built inputs.
//
// Four were Python scripts until T3 of the architecture refactor. The ports were graded by
// running both, output for output, before the Python was deleted: stdout and exit code were
// byte-identical on real `VL_PROFILE_GUEST` profiles (a `check` of `compiler/entry.vl` and of
// `std/json.vl`, a `build` of `compiler/entry.vl`, every row printed), on a full
// `deno test --parallel tests/` log of 11,743 test lines, on the live `compiler/` + `std/`
// tree, and on every fixture below. Rounding follows the Python: an exact tie goes to even
// (`0.125` prints `0.12`, a 6.25% share prints `6.2`). Where they could not agree, pinned here
// as the ports' own behaviour:
//
//   1. THE STREAM AND CODE OF A LOUD FAILURE. VL has no stderr sink, so the usage line and every
//      error go to stdout. The usage line (exit 2) replaces the Python's docstring or
//      IndexError; profile-phases' `no samples` keeps exit 1 on stdout; profile-parents asked
//      for a function over a profile with no samples exits 1 with one line where the Python
//      raised ZeroDivisionError.
//   2. string-concat-sites resolves `compiler/` and `std/` against the WORKING DIRECTORY, not
//      the script's location — a VL program cannot read its own path. Run it from the root.
//
// @test-timing native

import { COMPILER, exists, nativeEnv, ROOT, VL } from "./support/tree.ts";
import { builtScript } from "./support/builtScript.ts";

const GATED = Deno.env.get("SELFHOST_NATIVE_ALIGN") === "1";
const ENABLED = GATED && exists(VL) && exists(COMPILER);
if (GATED && !ENABLED) {
  console.warn("[vl-perf-tools] skipped — missing vl binary or seed wasm.");
}

const dec = new TextDecoder();

const run = async (
  script: string,
  argv: string[],
  cwd = ROOT,
): Promise<{ code: number; out: string }> => {
  const { code, stdout } = await new Deno.Command(VL, {
    args: [
      "run",
      await builtScript(`${ROOT}/scripts/perf/${script}.vl`, { cwd: ROOT }),
      "--",
      ...argv,
    ],
    cwd,
    stdout: "piped",
    stderr: "piped",
    env: nativeEnv({ NO_COLOR: "1" }),
  }).output();
  return { code, out: dec.decode(stdout) };
};

const lines = (...ls: string[]): string => ls.join("\n") + "\n";

type Case = {
  script: string;
  argv: string[];
  code: number;
  out: string;
  cwd?: string;
};

const grade = async (dir: string, cases: Case[]) => {
  for (const c of cases) {
    const { code, out } = await run(c.script, c.argv, c.cwd);
    const name = [c.script, ...c.argv].map((a) => a.replace(dir, "<dir>")).join(
      " ",
    );
    if (code !== c.code || out !== c.out) {
      throw new Error(
        `[${name}] want exit ${c.code}:\n${c.out}\ngot exit ${code}:\n${out}`,
      );
    }
  }
};

// Names live in the SHARED table. `__str_eq__` is the leaf under four parents, one of them the
// root (prefix null); `checkProgram$m3@…` and `pinDeepIs$m` exercise the specialisation
// suffix; node 7 is checkProgram under emitProgram, so the ROOT-MOST phase must win; two
// samples have no stack; 16 check-side samples make modVisit's one sample a 6.25% tie.
const PROFILE = {
  meta: {},
  shared: {
    stringArray: [
      "root",
      "checkProgram$m3@typecheck.vl:10",
      "modVisit",
      "__str_eq__",
      "emitProgram",
      "lookup$m2",
      "other",
      "pinDeepIs$m",
    ],
  },
  threads: [{
    stringArray: [],
    funcTable: { name: [0, 1, 2, 3, 4, 5, 6, 7] },
    frameTable: { func: [0, 1, 2, 3, 4, 5, 6, 7] },
    stackTable: {
      frame: [0, 1, 2, 3, 5, 3, 4, 3, 2, 3, 6, 7],
      prefix: [null, 0, 1, 2, 1, 4, 0, 6, 0, null, 0, 0],
    },
    samples: {
      stack: [
        3,
        3,
        3,
        5,
        5,
        5,
        5,
        5,
        2,
        7,
        7,
        6,
        6,
        8,
        9,
        9,
        10,
        10,
        11,
        11,
        null,
        null,
      ],
    },
  }],
};

const EMPTY_PROFILE = {
  threads: [{
    stringArray: ["a"],
    funcTable: { name: [0] },
    frameTable: { func: [0] },
    stackTable: { frame: [0], prefix: [null] },
    samples: { stack: [null] },
  }],
};

Deno.test({
  name: "profile-parents and profile-phases over a fixed profile",
  ignore: !ENABLED,
  fn: async () => {
    const dir = await Deno.makeTempDir({ prefix: "vl_perf_tools_" });
    try {
      const prof = `${dir}/p.json`;
      await Deno.writeTextFile(prof, JSON.stringify(PROFILE));
      const empty = `${dir}/e.json`;
      await Deno.writeTextFile(empty, JSON.stringify(EMPTY_PROFILE));
      await grade(dir, [
        {
          script: "profile-parents",
          argv: [prof],
          code: 0,
          out: lines(
            "20 samples",
            "  60.00  __str_eq__",
            "  10.00  modVisit",
            "  10.00  emitProgram",
            "  10.00  other",
            "  10.00  pinDeepIs$m",
          ),
        },
        {
          script: "profile-parents",
          argv: [prof, "__str_eq__"],
          code: 0,
          out: lines(
            "20 samples; __str_eq__ is the leaf of 12 (60.00% self)",
            " of-total  of-func  immediate caller",
            "    25.00     41.7  lookup$m2",
            "    15.00     25.0  modVisit",
            "    10.00     16.7  emitProgram",
            "    10.00     16.7  <root>",
          ),
        },
        {
          script: "profile-parents",
          argv: [prof, "__str_eq__", "2"],
          code: 0,
          out: lines(
            "20 samples; __str_eq__ is the leaf of 12 (60.00% self)",
            " of-total  of-func  immediate caller",
            "    25.00     41.7  lookup$m2",
            "    15.00     25.0  modVisit",
          ),
        },
        {
          script: "profile-parents",
          argv: [prof, "absent"],
          code: 0,
          out: lines(
            "20 samples; absent is the leaf of 0 (0.00% self)",
            " of-total  of-func  immediate caller",
          ),
        },
        {
          script: "profile-parents",
          argv: [empty, "a"],
          code: 1,
          out: lines("profile-parents: the profile has no samples"),
        },
        {
          script: "profile-callers",
          argv: [prof],
          code: 0,
          out: lines(
            "20 samples; 12 in __ helpers (60.00%)",
            "   all%  str_eq  probe  hash  probe32  rsz32  rsz  other  caller",
            "  25.00  25.00   0.00   0.00   0.00   0.00   0.00   0.00  lookup",
            "  15.00  15.00   0.00   0.00   0.00   0.00   0.00   0.00  modVisit",
            "  10.00  10.00   0.00   0.00   0.00   0.00   0.00   0.00  emitProgram",
            "  10.00  10.00   0.00   0.00   0.00   0.00   0.00   0.00  <root>",
          ),
        },
        {
          script: "profile-callers",
          argv: [prof, "2", "2"],
          code: 0,
          out: lines(
            "20 samples; 12 in __ helpers (60.00%)",
            "   all%  str_eq  probe  hash  probe32  rsz32  rsz  other  caller",
            "  25.00  25.00   0.00   0.00   0.00   0.00   0.00   0.00  lookup < checkProgram",
            "  15.00  15.00   0.00   0.00   0.00   0.00   0.00   0.00  modVisit < checkProgram",
          ),
        },
        {
          script: "profile-callers",
          argv: [],
          code: 2,
          out: lines(
            "usage: vl run scripts/perf/profile-callers.vl -- <profile.json> [top] [depth]",
          ),
        },
        {
          script: "profile-parents",
          argv: [],
          code: 2,
          out: lines(
            "usage: vl run scripts/perf/profile-parents.vl -- <profile.json> [func] [top]",
          ),
        },
        {
          script: "profile-phases",
          argv: [prof],
          code: 0,
          out: lines(
            "samples 20; check side (everything but emitProgram) 16",
            "| phase | samples | % of run | % of the check side |",
            "| --- | ---: | ---: | ---: |",
            "| 1 order+validate (modVisit) | 1 | 5.00% | 6.2% |",
            "| 5 checkProgram (MERGED) | 9 | 45.00% | 56.2% |",
            "| 6 emitProgram (MERGED, build only) | 4 | 20.00% | — |",
            "| (outside every named phase) | 6 | 30.00% | 37.5% |",
          ),
        },
        {
          script: "profile-phases",
          argv: [empty],
          code: 1,
          out: lines("no samples"),
        },
        {
          script: "profile-phases",
          argv: [],
          code: 2,
          out: lines(
            "usage: vl run scripts/perf/profile-phases.vl -- <profile.json>",
          ),
        },
      ]);
    } finally {
      await Deno.remove(dir, { recursive: true });
    }
  },
});

// Plain and parallel-prefixed lines, `µs`/`s`/`m` units, ANSI colour, a tab before `=>`, a
// bare `./tests/` prefix, lines with no duration or an unknown unit, a name past 90 code
// points, and two 0.125 s tests whose tie prints `0.12`.
const LOG = [
  "running 3 tests from ./tests/a_test.ts",
  "first ... ok (125ms)",
  "  second  ... ok (2500µs)   ",
  "third ... \x1b[0m\x1b[32mok\x1b[0m (1.5s)",
  "no dots here (5ms)",
  "bad unit ... ok (5h)",
  "no unit ... ok (12)",
  "running 1 test from ./tests/b_test.ts",
  "./tests/c_test.ts => par one ... ok (122.5ms)",
  "./tests/c_test.ts => par ... two ... ok (2m)",
  "./tests/c_test.ts\t=> tabbed ... ok (3ms)",
  "./tests/ => empty ... ok (4ms)",
  "serial in b ... ok (125ms)",
  "a very long name with ünïcödé characters that goes on and on past the ninety code point " +
  "limit for sure yes ... ok (1ms)",
  "tie ... ok (125ms)",
  "",
].join("\n");

Deno.test({
  name: "per-test-rank over a fixed deno test log",
  ignore: !ENABLED,
  fn: async () => {
    const dir = await Deno.makeTempDir({ prefix: "vl_perf_tools_" });
    try {
      const log = `${dir}/t.log`;
      await Deno.writeTextFile(log, LOG);
      await grade(dir, [
        {
          script: "per-test-rank",
          argv: [log, "4"],
          code: 0,
          out: lines(
            "10 tests in 3 files, summed test time 122.0s",
            "",
            "     sec     n      %  file",
            "  120.12     2  98.5%  tests/c_test.ts",
            "    1.63     3   1.3%  tests/a_test.ts",
            "    0.26     5   0.2%  tests/b_test.ts",
            "",
            "     sec  file :: test",
            "  120.00  c_test.ts :: par",
            "    1.50  a_test.ts :: third",
            "    0.12  b_test.ts :: tie",
            "    0.12  b_test.ts :: serial in b",
          ),
        },
        {
          script: "per-test-rank",
          argv: [],
          code: 2,
          out: lines(
            "usage: vl run scripts/perf/per-test-rank.vl -- <deno.log> [top]",
          ),
        },
      ]);
    } finally {
      await Deno.remove(dir, { recursive: true });
    }
  },
});

// A `//` comment and a `+` inside a string literal must not count; `+=`, a missing space
// around `+`, a `} for` loop head, a dotfile (counted, as the Python's glob did), loop depth 3,
// and a site line past 80 code points.
const SOURCES: Record<string, string> = {
  "compiler/a.vl": String.raw`let s = "x"
let r: string
while x { s = s + "\\" + "y" + "z"
  r = r + "w"
}
  } for y in z {
    r = r + "deep" + "er" + "est" + "most"
  }
`,
  "compiler/b.vl": String.raw`let s = ""
let t: string = "x"
const u: string[] = []
let notstr = 0
function f() {
  while true {
    s = s + "a" // s = s + comment
    s += s + t
    notstr = notstr + 1
    t = t + "x\"y + z" + s
    for x in u {
      s = s + "q" + "r" + "s"
      t = t+s
    } while false {
      s = s + "deep"
    }
  }
  s = s + "out" + "side" + "x"
  let w = "lit" + "a" + "b"
}
`,
  "compiler/.hidden.vl": `let s = ""
while 1 {
  s = s + "x"
}
`,
  "std/a.vl": `let s = ""
while 1 {
  s = s + "é" + "ü" + s
  for q in w {
    s = s + "long line, long line, long line, long line, long line, long line, long line, long line" + s
  }
}
`,
};

Deno.test({
  name: "string-concat-sites over a fixed compiler/ + std/ tree",
  ignore: !ENABLED,
  fn: async () => {
    const dir = await Deno.makeTempDir({ prefix: "vl_perf_tools_" });
    try {
      await Deno.mkdir(`${dir}/compiler`);
      await Deno.mkdir(`${dir}/std`);
      for (const [p, src] of Object.entries(SOURCES)) {
        await Deno.writeTextFile(`${dir}/${p}`, src);
      }
      await grade(dir, [
        {
          script: "string-concat-sites",
          argv: ["--list", "3"],
          cwd: dir,
          code: 0,
          out: lines(
            "(a) string self-append sites: 12 total, 11 inside a loop, 4 at loop depth >= 2",
            "       6  b.vl",
            "       4  a.vl",
            "       1  .hidden.vl",
            "(b) chains of 3+ string operands: 7, 5 inside a loop",
            "       1  x 5 operands",
            "       3  x 4 operands",
            "       3  x 3 operands",
            '    L3 compiler/b.vl:15  s = s + "deep"',
            '    L2 std/a.vl:5  s = s + "long line, long line, long line, long line, long line, long line, long ',
            "    L2 compiler/b.vl:13  t = t+s",
          ),
        },
        {
          script: "string-concat-sites",
          argv: ["--list"],
          cwd: dir,
          code: 2,
          out: lines(
            "usage: vl run scripts/perf/string-concat-sites.vl -- [--list N]",
          ),
        },
      ]);
    } finally {
      await Deno.remove(dir, { recursive: true });
    }
  },
});
