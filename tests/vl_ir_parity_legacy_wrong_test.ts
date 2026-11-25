// A `legacy-wrong:` DIVERGENCE IS PROVED BY THE PROGRAM'S EXPECTED OUTPUT (ruling O3). `ir-parity.vl`
// grades a program the divergence baseline lists that way on its IR-on run alone: it passes when
// stdout meets the `// @log` lines (a `// @trap` as any trap) or an inventory row's `Want:`, and reds
// when it misses them or names none. IR off is not consulted, so the claimless face here is the
// seed itself. No assertion library, per CLAUDE.md.
//
// Run with:  SELFHOST_NATIVE_ALIGN=1 deno test -A tests/vl_ir_parity_legacy_wrong_test.ts

import { COMPILER, exists, ROOT, VL } from "./support/tree.ts";

const ignore = !exists(VL) || !exists(COMPILER);
if (ignore) console.warn("[ir-parity-legacy-wrong] skipped — needs the vl binary and build/vl-compiler.wasm");

const PROGRAMS: Record<string, string> = {
  "meets.vl": '// @run\n// @log 3\n// @log\n// @log hi\nprint(1 + 2)\nprint("")\nprint("hi")\n',
  "misses.vl": "// @log 4\nprint(1 + 2)\n",
  "unstated.vl": "print(5)\n",
  "traps.vl": "// @trap\nconst a = [1]\nlet i = 3\nprint(a[i])\n",
  "should-trap.vl": "// @trap\nprint(1)\n",
};

/** `ir-parity.vl --files` over `PROGRAMS`, each listed `legacy-wrong:`; exit code and rows by name. */
function grade() {
  const root = Deno.makeTempDirSync();
  try {
    const files = Object.entries(PROGRAMS).map(([n, src]) => {
      Deno.writeTextFileSync(`${root}/${n}`, src);
      return `${root}/${n}`;
    });
    const base = files.map((f) => `${f}\tmain\tlegacy-wrong: control\t#0\n`).join("");
    Deno.writeTextFileSync(`${root}/baseline.txt`, base);
    const out = new Deno.Command(VL, {
      args: [
        "run", "scripts/ir-parity.vl", "--compiler", COMPILER, "--",
        "--seed", COMPILER, "--claimless", COMPILER, "--out", `${root}/rows.tsv`, "--files", ...files,
      ],
      cwd: ROOT,
      env: { VL_STD: `${ROOT}/std`, IR_DIVERGENCE_BASELINE: `${root}/baseline.txt`, RUST_BACKTRACE: "0" },
      stdout: "piped",
      stderr: "piped",
    }).outputSync();
    const rows = new Map<string, string>();
    for (const l of Deno.readTextFileSync(`${root}/rows.tsv`).split("\n")) {
      const [f, v, d] = l.split("\t");
      if (f) rows.set(f.slice(root.length + 1), `${v}\t${d}`);
    }
    return { code: out.code, rows, text: new TextDecoder().decode(out.stdout) };
  } finally {
    Deno.removeSync(root, { recursive: true });
  }
}

Deno.test({ name: "ir-parity: a legacy-wrong program is graded on its expected output", ignore }, () => {
  const r = grade();
  const want: Record<string, string> = {
    "meets.vl": "same\tlegacy-wrong, on meets its expected output",
    "traps.vl": "same\tlegacy-wrong, on meets its expected output",
    "misses.vl": "differs\tlegacy-wrong: on vs expected stdout line 1: 3 vs 4",
    "unstated.vl": "differs\tlegacy-wrong: no expected output (no // @log, @trap or @run line, no Want)",
    "should-trap.vl": "differs\tlegacy-wrong: on ok, expected a trap",
  };
  for (const [f, w] of Object.entries(want)) {
    if (r.rows.get(f) !== w) throw new Error(`${f}: want "${w}", got "${r.rows.get(f)}"\n${r.text}`);
  }
  if (r.code !== 1 || !r.text.includes("legacy-wrong meeting expected output 2")) {
    throw new Error(`want exit 1 and 2 meeting their output, got exit ${r.code}:\n${r.text}`);
  }
});
