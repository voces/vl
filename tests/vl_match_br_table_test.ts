// A DENSE INTEGER `match` LOWERS TO ONE `br_table`; A SPARSE ONE KEEPS THE COMPARE CHAIN.
//
// Plumb's PL-001: an integer `match` desugars to a linear if-chain, so dispatch cost grew with
// the arm count and binaryen -O3 did not recover a jump table. The emitter now lowers the chain
// an integer `match` built to `br_table` when its literal set is dense (match-design.md
// §"A dense integer match is a `br_table`"). Each program below is compiled, disassembled with
// `wasm-dis`, and its `br_table` count compared with the rule's answer — BOTH directions, so a
// heuristic that stopped firing and one that fired on a sparse set are each caught. Every
// program's output is asserted too: a table that dispatches to the wrong arm still counts one.
//
// GATING mirrors the other seed-backed suites: `SELFHOST_NATIVE_ALIGN=1` plus the vl binary,
// the seed and `wasm-dis` (at node_modules/.bin, not on PATH). No assertion library.
//
// @test-timing native

import { COMPILER, exists, ROOT, VL } from "./support/tree.ts";

const WASM_DIS = `${ROOT}/node_modules/.bin/wasm-dis`;

const GATED = Deno.env.get("SELFHOST_NATIVE_ALIGN") === "1";
const ENABLED = GATED && exists(VL) && exists(COMPILER) && exists(WASM_DIS);
if (GATED && !ENABLED) {
  console.warn(
    "[match-br-table] skipped — missing vl binary, seed or wasm-dis. Build:\n" +
      "  (cd scripts/vl-host && cargo build --release)\n" +
      "  scripts/refresh-compiler.sh\n  npm ci",
  );
}

/** A `match` over `x` with one arm per value in `vals`, arm `k` yielding `k`, `_` yielding -1. */
function matchFn(vals: number[], scrutTy = "i32"): string {
  const arms = vals.map((v, k) => `    ${v} => ${k}`).join("\n");
  return `function f(x: ${scrutTy}) {\n  match x {\n${arms}\n    _ => -1\n  }\n}\n`;
}

const THOUSAND = Array.from({ length: 1000 }, (_, i) => i);

const PROGRAMS: Record<string, { src: string; want: number; out: string }> = {
  // The consumer's own witness: a dispatch loop over a mutated state local.
  plumb_witness: {
    src: `function f1() {
  let b = 0
  while true {
    match b {
      0 => { b = 1 }
      1 => { b = 2 }
      2 => { return }
      _ => { __trap__() }
    }
  }
}
f1()
print("done")
`,
    want: 1,
    out: "done\n",
  },
  dense_1000: {
    src: matchFn(THOUSAND) +
      "print(f(0))\nprint(f(999))\nprint(f(1000))\nprint(f(-1))\n",
    want: 1,
    out: "0\n999\n-1\n-1\n",
  },
  offset_i64: {
    src: matchFn([100, 101, 102, 104], "i64") +
      "print(f(101))\nprint(f(103))\nprint(f(4294967397))\n",
    want: 1,
    out: "1\n-1\n-1\n",
  },
  sparse: {
    src: matchFn([1, 1000, 100000]) +
      "print(f(1000))\nprint(f(2))\n",
    want: 0,
    out: "1\n-1\n",
  },
  two_arms: {
    src: matchFn([0, 1]) + "print(f(1))\nprint(f(2))\n",
    want: 0,
    out: "1\n-1\n",
  },
  // A scrutinee that is not a plain variable is bound to a temp once (D1991), so the match
  // over the temp is table-eligible like any other.
  computed_scrutinee: {
    src: `function g(x: i32) {
  match x % 7 {
    0 => 10
    1 => 11
    2 => 12
    _ => 19
  }
}
print(g(8))
print(g(6))
`,
    want: 1,
    out: "11\n19\n",
  },
  // D1991's witness as a table: the call runs once, so the arm is the one its first value picks.
  side_effecting_scrutinee: {
    src: `let n = 5
function next() {
  n = n + 1
  n
}
const r = match next() {
  5 => "five"
  6 => "six"
  7 => "seven"
  _ => "other"
}
print("\\{r} \\{n}")
`,
    want: 1,
    out: "six 6\n",
  },
  // Only a chain a `match` built is marked; a hand-written dense `else if` chain over the same
  // literals keeps its compares.
  hand_written_chain: {
    src: `function h(x: i32) {
  if x == 0 {
    return 10
  } else if x == 1 {
    return 11
  } else if x == 2 {
    return 12
  } else if x == 3 {
    return 13
  } else {
    return 19
  }
}
print(h(2))
print(h(7))
`,
    want: 0,
    out: "12\n19\n",
  },
};

function run(
  cmd: string,
  args: string[],
): { code: number; out: string; err: string } {
  const r = new Deno.Command(cmd, {
    args,
    env: { VL_STD: `${ROOT}/std` },
    stdout: "piped",
    stderr: "piped",
  }).outputSync();
  const dec = new TextDecoder();
  return { code: r.code, out: dec.decode(r.stdout), err: dec.decode(r.stderr) };
}

/** The module's `br_table` count and what the program prints. */
function measure(
  dir: string,
  name: string,
  src: string,
): { tables: number; out: string } {
  const vl = `${dir}/${name}.vl`;
  const wasm = `${dir}/${name}.wasm`;
  Deno.writeTextFileSync(vl, src);
  const build = run(VL, ["build", vl, "-o", wasm, "--compiler", COMPILER]);
  if (build.code !== 0) {
    throw new Error(`building ${name} failed (rc ${build.code}): ${build.err}`);
  }
  const exec = run(VL, ["run", vl, "--compiler", COMPILER]);
  if (exec.code !== 0) {
    throw new Error(`running ${name} failed (rc ${exec.code}): ${exec.err}`);
  }
  const dis = run(WASM_DIS, [
    "--enable-reference-types",
    "--enable-gc",
    "--enable-bulk-memory",
    "--enable-tail-call",
    wasm,
  ]);
  if (dis.code !== 0) {
    throw new Error(`wasm-dis ${name} failed (rc ${dis.code}): ${dis.err}`);
  }
  const tables =
    dis.out.split("\n").filter((l) => l.includes("br_table")).length;
  return { tables, out: exec.out };
}

Deno.test({
  name:
    "integer `match`: a dense literal set is one `br_table`, a sparse one stays a chain",
  ignore: !ENABLED,
  fn: () => {
    const dir = Deno.makeTempDirSync({ prefix: "vl-match-br-table-" });
    try {
      for (const [name, spec] of Object.entries(PROGRAMS)) {
        const got = measure(dir, name, spec.src);
        if (got.tables !== spec.want) {
          throw new Error(
            `${name}: want ${spec.want} br_table(s) in the module, got ${got.tables}`,
          );
        }
        if (got.out !== spec.out) {
          throw new Error(
            `${name}: want output ${JSON.stringify(spec.out)}, got ${
              JSON.stringify(got.out)
            }`,
          );
        }
      }
    } finally {
      Deno.removeSync(dir, { recursive: true });
    }
  },
});
