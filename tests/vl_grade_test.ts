// `scripts/silent-sweep/grade.vl`, held to fixed output over a hand-built sweep.
//
// The tool was `scripts/silent-sweep/grade.py` until T3 of the architecture refactor. The port
// was graded by running both, output for output, before the Python was deleted: stdout and the
// csv were byte-identical on two real sweeps (`genorder.py`'s 219 cells, and every 16th cell of
// `gen.py`'s grid, 1,118 cells), and on the fixture below, whose 13 cells land one in every
// column and carry each csv quoting case (comma, double quote, newline) and an invalid UTF-8
// byte in a run's output and in its stderr. The expected text here is the Python's. Where they
// could not agree, pinned here as the port's own behaviour:
//
//   1. THE STREAM AND CODE OF A LOUD FAILURE. The usage line goes to stdout with exit 2, and an
//      unreadable manifest is one stdout line with exit 1; the Python raised a traceback and
//      exited 1 for both.
//   2. A NON-STRING `expected` ENTRY is refused up front, exit 1. The Python graded such a cell
//      and then raised a TypeError writing the csv.
//
// @test-timing native

import { COMPILER, exists, nativeEnv, ROOT, VL } from "./support/tree.ts";

const GATED = Deno.env.get("SELFHOST_NATIVE_ALIGN") === "1";
const ENABLED = GATED && exists(VL) && exists(COMPILER);
if (GATED && !ENABLED) {
  console.warn("[vl-grade] skipped — missing vl binary or seed wasm.");
}

const enc = new TextEncoder();
const dec = new TextDecoder();

const b64 = (b: Uint8Array): string => {
  let bin = "";
  for (const x of b) bin += String.fromCharCode(x);
  return btoa(bin);
};
const bytes = (s: string, ...tail: number[]): Uint8Array =>
  new Uint8Array([...enc.encode(s), ...tail]);

type R = {
  check?: string;
  checkRc?: string;
  run?: Uint8Array;
  runErr?: Uint8Array;
  runRc?: string;
  size?: string;
};

const resFile = (r: R): string =>
  [
    `CHECKRC ${r.checkRc ?? "0"}`,
    `BUILDSIZE ${r.size ?? "100"}`,
    `RUNRC ${r.runRc ?? "0"}`,
    `CHECKERR ${r.check ? b64(enc.encode(r.check)) : ""}`,
    `RUNOUT ${r.run ? b64(r.run) : ""}`,
    `RUNERR ${r.runErr ? b64(r.runErr) : ""}`,
  ].join("\n") + "\n";

// One cell per column; `c12_missing` has no result file.
const RESULTS: Record<string, R> = {
  c01_correct: { run: bytes("a,b\nit's\n1\n") },
  c02_value: { run: bytes('a,b\nsay "hi"\n1\n') },
  c03_count: { run: bytes("a,b\nit's\n2\n") },
  c04_empty: { run: bytes("") },
  c05_invalid: {
    runRc: "1",
    runErr: bytes(
      "Error: failed\n  /tmp/x/cell.vl:3:14:   Invalid input WebAssembly code at offset 7\n",
    ),
  },
  c06_trap: { runRc: "1", runErr: bytes("wasm trap: unreachable\n") },
  c07_ctrap: {
    runRc: "1",
    size: "0",
    runErr: bytes("out of bounds array access"),
  },
  c08_check: { checkRc: "1", check: '[HINT] h\n[ERROR] no, "never"\n' },
  c09_emit: { runRc: "1", runErr: bytes("Error: x\nemitProgram: no rep\n") },
  c10_hint: { checkRc: "1", check: "[WARNING] w\n[HINT] h1\n" },
  c11_other: {
    runRc: "1",
    runErr: bytes("Error: e\nCaused by: c\nbad ", 0xff, 0x41, 0x0a),
  },
  c13_bytes: { run: bytes("a", 0xe2, 0x82, 0x0a, 0x31, 0x0a) },
};

const manifest = (): string => {
  const cells: Record<string, Record<string, unknown>> = {};
  let i = 0;
  for (const name of [...Object.keys(RESULTS), "c12_missing"].sort()) {
    i++;
    cells[name] = {
      expected: ["a,b", "it's", "1"],
      leg: "L" + i,
      rep: i,
      nul: i % 2 === 0,
      pos: null,
      con: i === 3 ? 1.5 : i === 1 ? "x\ny" : "c",
      read: "r",
      inp: "i",
      ...(i === 4 ? { spell: "alias", scope: "mod" } : {}),
    };
  }
  return JSON.stringify({ cells });
};

const lines = (...ls: string[]): string => ls.join("\n") + "\n";

const STDOUT = (csv: string) =>
  lines(
    "cells=13 result_files=12 MATCH=MISMATCH",
    "",
    "== outcome columns ==",
    "correct                     1 / 13",
    "wrong_value                 3 / 13",
    "wrong_evalcount             1 / 13",
    "invalid_wasm                1 / 13",
    "trap                        1 / 13",
    "compiler_trap               1 / 13",
    "loud_check_reject           1 / 13",
    "loud_emit_reject            1 / 13",
    "hint_only_rc1               1 / 13",
    "other_runtime_fail          1 / 13",
    "missing_result              1 / 13",
    "",
    "SILENT TOTAL                7 / 13",
    "",
    `wrote ${csv}`,
  );

const E = `"a,b|it's|1"`;
const CSV = [
  "cell,leg,rep,nul,pos,con,read,inp,spell,scope,outcome,msg,expected",
  `c01_correct,L1,1,False,,"x\ny",r,i,inline,fn,correct,,${E}`,
  `c02_value,L2,2,True,,c,r,i,inline,fn,wrong_value,"expected ['a,b', ""it's""] got ['a,b', 'say ""hi""'] (calls 1)",${E}`,
  `c03_count,L3,3,False,,1.5,r,i,inline,fn,wrong_evalcount,calls expected 1 got 2,${E}`,
  `c04_empty,L4,4,True,,c,r,i,alias,mod,wrong_value,"expected ['a,b', ""it's""] got [] (calls None)",${E}`,
  `c05_invalid,L5,5,False,,c,r,i,inline,fn,invalid_wasm,Invalid input WebAssembly code at offset 7,${E}`,
  `c06_trap,L6,6,True,,c,r,i,inline,fn,trap,wasm trap: unreachable,${E}`,
  `c07_ctrap,L7,7,False,,c,r,i,inline,fn,compiler_trap,out of bounds array access,${E}`,
  `c08_check,L8,8,True,,c,r,i,inline,fn,loud_check_reject,"[ERROR] no, ""never""",${E}`,
  `c09_emit,L9,9,False,,c,r,i,inline,fn,loud_emit_reject,emitProgram: no rep,${E}`,
  `c10_hint,L10,10,True,,c,r,i,inline,fn,hint_only_rc1,[HINT] h1,${E}`,
  `c11_other,L11,11,False,,c,r,i,inline,fn,other_runtime_fail,bad �A,${E}`,
  `c12_missing,L12,12,True,,c,r,i,inline,fn,missing_result,,${E}`,
  `c13_bytes,L13,13,False,,c,r,i,inline,fn,wrong_value,"expected ['a,b', ""it's""] got ['a�'] (calls 1)",${E}`,
].join("\r\n") + "\r\n";

const run = async (
  argv: string[],
): Promise<{ code: number; out: string }> => {
  const { code, stdout } = await new Deno.Command(VL, {
    args: [
      "run",
      "scripts/silent-sweep/grade.vl",
      "--compiler",
      COMPILER,
      "--",
      ...argv,
    ],
    cwd: ROOT,
    stdout: "piped",
    stderr: "piped",
    env: nativeEnv({ NO_COLOR: "1" }),
  }).output();
  return { code, out: dec.decode(stdout) };
};

Deno.test({
  name: "grade: every outcome column and the csv over a fixed sweep",
  ignore: !ENABLED,
  fn: async () => {
    const dir = await Deno.makeTempDir({ prefix: "vl_grade_" });
    try {
      await Deno.mkdir(`${dir}/cells`);
      await Deno.mkdir(`${dir}/res`);
      await Deno.writeTextFile(`${dir}/cells/manifest.json`, manifest());
      for (const [n, r] of Object.entries(RESULTS)) {
        await Deno.writeTextFile(`${dir}/res/${n}.res`, resFile(r));
      }
      const csv = `${dir}/out.csv`;
      const g = await run([`${dir}/cells`, `${dir}/res`, "--csv", csv]);
      if (g.code !== 0 || g.out !== STDOUT(csv)) {
        throw new Error(
          `want exit 0:\n${STDOUT(csv)}got exit ${g.code}:\n${g.out}`,
        );
      }
      const got = await Deno.readTextFile(csv);
      if (got !== CSV) {
        throw new Error(`csv: want:\n${CSV}got:\n${got}`);
      }

      const u = await run([`${dir}/cells`]);
      const usage =
        "usage: vl run scripts/silent-sweep/grade.vl -- <celldir> <resdir> [--csv out.csv]\n";
      if (u.code !== 2 || u.out !== usage) {
        throw new Error(
          `usage: want exit 2:\n${usage}got ${u.code}:\n${u.out}`,
        );
      }

      await Deno.mkdir(`${dir}/bad`);
      await Deno.writeTextFile(
        `${dir}/bad/manifest.json`,
        JSON.stringify({ cells: { z: { expected: [1] } } }),
      );
      const b = await run([`${dir}/bad`, `${dir}/res`]);
      const want = "grade: z.expected holds a non-string\n";
      if (b.code !== 1 || b.out !== want) {
        throw new Error(
          `non-string: want exit 1:\n${want}got ${b.code}:\n${b.out}`,
        );
      }
    } finally {
      await Deno.remove(dir, { recursive: true });
    }
  },
});
