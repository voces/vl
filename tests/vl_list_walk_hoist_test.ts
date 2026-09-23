// A LIST WALK READS ITS HEADER ONCE WHEN THE BODY CANNOT MOVE IT, AND A RANGE UP TO
// `xs.length` INDEXES WITHOUT A GUARD.
//
// Plumb's PL-014 lane L6: a `for b in xs` over `u8[]` re-read the wrapper's backing and `len`
// every step, and `xs[i]` under `for i in 0 until xs.length` kept its `i u< len` select though
// the range proves it. A call-free body cannot push or pop through any alias, so
// `emitForInStmt` now reads the header once and `rangeProofOpen` drops the select. Each
// program is compiled, disassembled with `wasm-dis`, and the `struct.get`s and `select`s
// INSIDE its loops are counted — both directions, so an optimisation that stopped firing and
// one that fired on a body that can push are each caught. Every output is asserted too.
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
    "[list-walk-hoist] skipped — missing vl binary, seed or wasm-dis. Build:\n" +
      "  (cd scripts/vl-host && cargo build --release)\n" +
      "  scripts/refresh-compiler.sh\n  npm ci",
  );
}

type Spec = {
  src: string;
  gets: (n: number) => boolean;
  selects: number;
  out: string;
};

const PROGRAMS: Record<string, Spec> = {
  // The consumer's shape: a byte sum over a call-free body — header read once.
  u8_for_in: {
    src: `function f(xs: u8[]): i32 {
  let s = 0
  for b in xs { s += b }
  s
}
print(f([1, 2, 250]))
`,
    gets: (n) => n === 0,
    selects: 0,
    out: "253\n",
  },
  f64_for_in: {
    src: `function f(xs: f64[]): f64 {
  let s = 0.0
  for x in xs { s += x }
  s
}
print(f([1.5, 2.25]))
`,
    gets: (n) => n === 0,
    selects: 0,
    out: "3.75\n",
  },
  // A body that calls `push` keeps the per-step read, so the pushed elements are walked.
  push_in_body: {
    src: `function f(xs: i32[]): i32 {
  let s = 0
  for x in xs {
    if x < 3 { xs.push(x + 10) }
    s += x
  }
  s
}
print(f([1, 2, 3]))
`,
    gets: (n) => n >= 2,
    selects: 0,
    out: "29\n",
  },
  range_until_len: {
    src: `function f(xs: u8[]): i32 {
  let s = 0
  for i in 0 until xs.length { s += xs[i] }
  s
}
print(f([4, 5, 6]))
`,
    gets: (n) => n === 0,
    selects: 0,
    out: "15\n",
  },
  range_to_len_minus_one: {
    src: `function f(xs: i32[]): i32 {
  let s = 0
  for i in 0 to xs.length - 1 { s += xs[i] }
  s
}
print(f([4, 5, 6]))
`,
    gets: (n) => n === 0,
    selects: 0,
    out: "15\n",
  },
  // Not proofs: an inclusive `to xs.length`, a bound that is not the receiver's length, and a
  // loop variable the body reassigns. Each keeps its guard.
  range_to_len: {
    src: `function f(xs: i32[], n: i32): i32 {
  let s = 0
  for i in 0 to n { s += xs[i] }
  for i in 0 to xs.length { if i < n { s += xs[i] } }
  s
}
print(f([4, 5, 6], 2))
`,
    gets: (n) => n === 0,
    selects: 2,
    out: "24\n",
  },
  range_rebound: {
    src: `function f(xs: i32[]): i32 {
  let s = 0
  for i in 0 until xs.length {
    i = i + 1
    s += xs[i]
  }
  s
}
print(f([4, 5, 6, 7]))
`,
    gets: (n) => n === 0,
    selects: 1,
    out: "12\n",
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

/** Lines inside every `(loop` of the module, each loop's body taken up to its closing paren. */
function loopLines(wat: string): string[] {
  const lines = wat.split("\n");
  const inside: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^(\s*)\(loop\b/);
    if (!m) continue;
    const close = `${m[1]})`;
    for (let j = i + 1; j < lines.length && lines[j] !== close; j++) {
      inside.push(lines[j]);
    }
  }
  return inside;
}

function measure(
  dir: string,
  name: string,
  src: string,
): { gets: number; selects: number; out: string } {
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
  const body = loopLines(dis.out);
  return {
    gets: body.filter((l) => l.includes("struct.get")).length,
    selects: body.filter((l) => l.includes("(select")).length,
    out: exec.out,
  };
}

Deno.test({
  name:
    "list walks: a call-free body reads the header once; a range to xs.length drops the guard",
  ignore: !ENABLED,
  fn: () => {
    const dir = Deno.makeTempDirSync({ prefix: "vl-list-walk-hoist-" });
    try {
      for (const [name, spec] of Object.entries(PROGRAMS)) {
        const got = measure(dir, name, spec.src);
        if (!spec.gets(got.gets)) {
          throw new Error(
            `${name}: unexpected struct.get count inside loops: ${got.gets} (${spec.gets})`,
          );
        }
        if (got.selects !== spec.selects) {
          throw new Error(
            `${name}: want ${spec.selects} select(s) inside loops, got ${got.selects}`,
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
