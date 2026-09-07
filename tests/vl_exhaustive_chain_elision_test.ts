// THE LAST ARM OF A PROVABLY EXHAUSTIVE `is`-CHAIN CARRIES NO COMPARISON.
//
// `ifChainExhausts` already proves that an else-less chain of `place is T` arms covers every
// member of the place's union. Reaching the last arm therefore means the value is one of the
// members no earlier arm covers, so its test is provably true and the arm lowers as the bare
// `else` the design names — the shape `match` has had since its desugar picked an else arm.
//
// THE ASSERTION IS A DIFFERENTIAL, NOT AN ABSOLUTE COUNT. A module's `i32.eq` count also
// carries whatever the program's own comparisons emit, and those move for reasons that have
// nothing to do with this. So three programs that differ ONLY in their chain are compiled and
// the tag comparisons are counted inside the ONE function under test:
//
//   exhaustive     2 arms over a 2-member union, no else  → 1 comparison (the last is elided)
//   with_else      the same 2 arms plus a real `else`     → 2 (nothing is provable)
//   three_member   3 arms over a 3-member union, no else  → 2
//
// A regression that stopped eliding makes the first 2; one that elided too eagerly makes the
// second 1, which would be a MISCOMPILE — `with_else` reaches its last arm on a value the arm
// does not match, so the comparison there is load-bearing. Both directions are asserted.
//
// The counts are read off `wasm-dis` output rather than the binary, per CLAUDE.md: the
// disassembler is at `node_modules/.bin/wasm-dis` and is not on PATH.
//
// GATING mirrors the other seed-backed suites: `SELFHOST_NATIVE_ALIGN=1` plus the vl binary,
// the seed and `wasm-dis`. Absent any, the case registers ignored with a note. No assertion
// library, per CLAUDE.md — every failure is a `throw new Error` with want/got.
//
// @test-timing native

import { COMPILER, ROOT, VL, exists } from "./support/tree.ts";

const WASM_DIS = `${ROOT}/node_modules/.bin/wasm-dis`;

const GATED = Deno.env.get("SELFHOST_NATIVE_ALIGN") === "1";
const ENABLED = GATED && exists(VL) && exists(COMPILER) && exists(WASM_DIS);
if (GATED && !ENABLED) {
  console.warn(
    "[exhaustive-chain-elision] skipped — missing vl binary, seed or wasm-dis. Build:\n" +
      "  (cd scripts/vl-host && cargo build --release)\n" +
      "  scripts/refresh-compiler.sh\n  npm ci",
  );
}

const PRE = `type Circle = { r: i32 }
type Square = { s: i32 }
type Tri = { t: i32 }
`;

const PROGRAMS: Record<string, { src: string; want: number; out: string }> = {
  exhaustive: {
    src: `${PRE}type Shape = Circle | Square
function area(sh: Shape): i32 {
  if sh is Circle {
    return sh.r
  } else if sh is Square {
    return sh.s
  }
}
print(area({ r: 2 }))
print(area({ s: 3 }))
`,
    want: 1,
    out: "2\n3\n",
  },
  with_else: {
    src: `${PRE}type Shape = Circle | Square
function area(sh: Shape): i32 {
  if sh is Circle {
    return sh.r
  } else if sh is Square {
    return sh.s
  } else {
    return 0
  }
}
print(area({ r: 2 }))
print(area({ s: 3 }))
`,
    want: 2,
    out: "2\n3\n",
  },
  three_member: {
    src: `${PRE}type Shape = Circle | Square | Tri
function area(sh: Shape): i32 {
  if sh is Circle {
    return sh.r
  } else if sh is Square {
    return sh.s
  } else if sh is Tri {
    return sh.t
  }
}
print(area({ r: 2 }))
print(area({ s: 3 }))
print(area({ t: 4 }))
`,
    want: 2,
    out: "2\n3\n4\n",
  },
};

/** The `i32.eq` count inside the FIRST `(func …)` of `src`, plus what the program prints. */
function measure(
  dir: string,
  name: string,
  src: string,
): { eqs: number; out: string } {
  const vl = `${dir}/${name}.vl`;
  const wasm = `${dir}/${name}.wasm`;
  Deno.writeTextFileSync(vl, src);
  const env = { VL_STD: `${ROOT}/std` };
  const build = new Deno.Command(VL, {
    args: ["build", vl, "-o", wasm, "--compiler", COMPILER],
    env,
    stdout: "piped",
    stderr: "piped",
  }).outputSync();
  if (build.code !== 0) {
    throw new Error(
      `building ${name} failed (rc ${build.code}): ${
        new TextDecoder().decode(build.stderr)
      }`,
    );
  }
  const run = new Deno.Command(VL, {
    args: ["run", vl, "--compiler", COMPILER],
    env,
    stdout: "piped",
    stderr: "piped",
  }).outputSync();
  if (run.code !== 0) {
    throw new Error(
      `running ${name} failed (rc ${run.code}): ${
        new TextDecoder().decode(run.stderr)
      }`,
    );
  }
  const dis = new Deno.Command(WASM_DIS, {
    args: [wasm],
    stdout: "piped",
    stderr: "piped",
  }).outputSync();
  if (dis.code !== 0) {
    throw new Error(
      `wasm-dis ${name} failed (rc ${dis.code}): ${
        new TextDecoder().decode(dis.stderr)
      }`,
    );
  }
  const wat = new TextDecoder().decode(dis.stdout).split("\n");
  const start = wat.findIndex((l) => l.startsWith(" (func "));
  if (start < 0) throw new Error(`${name}: no function in the disassembly`);
  let end = wat.length;
  for (let i = start + 1; i < wat.length; i++) {
    if (wat[i].startsWith(" (func ") || wat[i].startsWith(" (export ")) {
      end = i;
      break;
    }
  }
  const eqs = wat.slice(start, end).filter((l) =>
    l.includes("i32.eq") && !l.includes("i32.eqz")
  ).length;
  return { eqs, out: new TextDecoder().decode(run.stdout) };
}

Deno.test({
  name:
    "exhaustive `is`-chain: the last arm's comparison is elided, and only when it is provable",
  ignore: !ENABLED,
  fn: () => {
    const dir = Deno.makeTempDirSync({ prefix: "vl-exhaust-elide-" });
    try {
      for (const [name, spec] of Object.entries(PROGRAMS)) {
        const got = measure(dir, name, spec.src);
        if (got.eqs !== spec.want) {
          throw new Error(
            `${name}: want ${spec.want} tag comparison(s) in the chain's function, got ` +
              `${got.eqs} — the elision fires on the LAST arm of a provably exhaustive ` +
              `chain and nowhere else`,
          );
        }
        if (got.out !== spec.out) {
          throw new Error(
            `${name}: want output ${JSON.stringify(spec.out)}, got ` +
              JSON.stringify(got.out),
          );
        }
      }
    } finally {
      Deno.removeSync(dir, { recursive: true });
    }
  },
});
