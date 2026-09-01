// `std:fmt`'s f64 halves — `toString` over an f64 receiver and `parseF64` — graded
// against the ECMAScript oracle, which is not a metaphor: `String(v)` IS the
// shortest-round-trip rendering of a double and `Number(s)` IS its correctly
// rounded parse, both by specification, so this file runs the real V8 the same
// way the real seed runs the real VL and compares them character for character.
//
// WHY A SPAWNED `vl run` AND NOT A `tests/cases/` FIXTURE. A fixture pins one
// literal expected output; what needs proving here is an AGREEMENT with an
// oracle over thousands of values, and the oracle has to compute the answer
// rather than have it typed in. The vectors are generated deterministically
// (one seeded xorshift64, the same generator on both sides where it matters),
// so the run is reproducible without a committed data file.
//
// The `vl_` prefix is load-bearing: it is one of the globs `ci-native`
// auto-discovers (tests/ci_seed_coverage_test.ts), and a seed-backed test
// matching neither glob nor an explicit ci.yml step runs nowhere in CI.
//
// GATING: env-gated (`SELFHOST_NATIVE_ALIGN=1`) AND requires the built binary +
// seed wasm, so it self-ignores on a fresh clone and runs in `ci-native`.

const exists = (p: string): boolean => {
  try {
    Deno.statSync(p);
    return true;
  } catch {
    return false;
  }
};

const ROOT = new URL("../", import.meta.url).pathname.replace(/\/$/, "");
const VL = `${ROOT}/scripts/vl-host/target/release/vl`;
const COMPILER = `${ROOT}/build/vl-compiler.wasm`;
const STD = `${ROOT}/std`;

const GATED = Deno.env.get("SELFHOST_NATIVE_ALIGN") === "1";
const ENABLED = GATED && exists(VL) && exists(COMPILER);
if (GATED && !ENABLED) {
  console.warn("[vl-std-float-text] skipped — missing vl binary or seed wasm.");
}

/**
 * `vl run` over a generated program, with `VL_STD` pinned to THIS tree. `src`
 * is a function of the temp directory so a probe can name a side file by an
 * absolute path — `vl run`'s cwd is the test runner's, not the program's.
 */
const run = async (
  src: (dir: string) => string,
  extra: Record<string, string> = {},
): Promise<string[]> => {
  const dir = await Deno.makeTempDir({ prefix: "vl_float_text_" });
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
      // VL_STD pins the std dir to THIS tree: agent worktrees symlink the cargo
      // target into the main checkout, so the binary's exe-relative std/
      // fallback (/proc/self/exe resolves symlinks) would point at the wrong one.
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

// ── the f64 bit view, on the TS side ────────────────────────────────────────

const dv = new DataView(new ArrayBuffer(8));
const toF64 = (b: bigint): number => {
  dv.setBigInt64(0, BigInt.asIntN(64, b), true);
  return dv.getFloat64(0, true);
};
const bitsOf = (x: number): bigint => {
  dv.setFloat64(0, x, true);
  return dv.getBigInt64(0, true);
};

// ── the shared vector set ───────────────────────────────────────────────────

// Every f64 class worth naming, as (high 32 bits, low 32 bits) so the table has
// no negative literal: i64 min has no decimal spelling in VL (its magnitude
// overflows a positive i64 before any minus applies), and -0 is exactly i64 min.
const SPECIAL_PAIRS = `
  0, 0, 2147483648, 0, 1072693248, 0, 3220176896, 0,
  1071644672, 0, 1073217536, 0, 1073741824, 0, 1076101120, 0,
  1079574528, 0, 1145772772, 3605196624, 1048238066, 2596056904, 1051772663, 2696277389,
  1069128089, 2576980378, 1070176665, 2576980378, 1070805811, 858993459, 1070945621, 1431655765,
  1152724226, 3353430774, 1128267776, 0, 1128267776, 0, 2146435071, 4294967295,
  0, 1, 0, 2, 1048575, 4294967295, 1048576, 0,
  1420970413, 630506365, 724303662, 3834512688, 2117592124, 2281731484, 27618847, 3271095129,
  1142605114, 2114239706, 1146141508, 2395141640, 1106247680, 0, 1124887541, 640942080,
  1128383353, 937459712, 1131820119, 2245566464, 1055193269, 2296604913, 1074340347, 1413754136,
  1074118410, 2333366121, 1125957861, 76685261, 2146435072, 0, 4293918720, 0,
  2146959360, 0, 4294443008, 1,
`;

/** How many pseudo-random bit patterns the render probe walks after those. */
const RANDOM_VECTORS = 5000;

// The one seed, shared by both probes and reproduced in TS below where a test
// needs to know which values the VL side will see.
const SEED = "88172645463325252";

const PRELUDE = `
function mk(hi: i64, lo: i64): i64 { (hi << 32) | lo }

const SPECIAL: i64[] = [${SPECIAL_PAIRS}]

let seed: i64 = ${SEED}

// xorshift64 — deterministic, and reproduced bit for bit in the test harness.
function nextBits(): i64 {
  seed = seed ^ (seed << 13)
  seed = seed ^ (seed >>> 7)
  seed = seed ^ (seed << 17)
  seed
}
`;

/** The same xorshift64, in TS, so the harness can predict the VL sequence. */
function* xorshift64(seed: bigint): Generator<bigint> {
  const M = (1n << 64n) - 1n;
  let s = seed;
  for (;;) {
    s = (s ^ (s << 13n)) & M;
    s = s ^ (s >> 7n);
    s = (s ^ (s << 17n)) & M;
    yield BigInt.asIntN(64, s);
  }
}

// ── 1. render: identity with the oracle, and the round trip ─────────────────

// Four lines per vector: the bit pattern, what the HOST's `print` makes of the
// value, what `toString` makes of it, and the bits `parseF64` gives back.
const RENDER_SRC = () => `import { parseF64, toString } from "std:fmt"
${PRELUDE}
function emit(b: i64) {
  const x = f64fromBits(b)
  print(b.toString())
  print(x)
  print(x.toString())
  const back = parseF64(x.toString())
  if back is null {
    print("NULL")
  } else {
    print(f64bits(back).toString())
  }
}

let i = 0
while i + 1 < SPECIAL.length {
  emit(mk(SPECIAL[i], SPECIAL[i + 1]))
  i = i + 2
}
let n = 0
while n < ${RANDOM_VECTORS} {
  emit(nextBits())
  n = n + 1
}
`;

type RenderRow = { bits: bigint; host: string; vl: string; back: string };

const renderRows = async (): Promise<RenderRow[]> => {
  const lines = await run(RENDER_SRC);
  if (lines.length % 4 !== 0) {
    throw new Error(`render probe emitted ${lines.length} lines, want a multiple of 4`);
  }
  const rows: RenderRow[] = [];
  for (let i = 0; i < lines.length; i += 4) {
    rows.push({
      bits: BigInt(lines[i]),
      host: lines[i + 1],
      vl: lines[i + 2],
      back: lines[i + 3],
    });
  }
  return rows;
};

let cachedRows: RenderRow[] | null = null;
const rows = async (): Promise<RenderRow[]> => {
  if (cachedRows === null) cachedRows = await renderRows();
  return cachedRows;
};

Deno.test({
  // The spec claim, and the whole point of the f64 arm: `x.toString()` is the
  // ECMAScript `Number::toString` of `x`, character for character, for every
  // class of double — the two zeros, both infinities, a NaN, the smallest
  // subnormal, the subnormal/normal boundary, the largest finite, the
  // positional/exponential switchover at 1e21 and 1e-7, and 5,000 pseudo-random
  // bit patterns on top.
  name: "std:fmt: toString(f64) equals JS String(v) on every vector",
  ignore: !ENABLED,
  fn: async () => {
    const rs = await rows();
    if (rs.length !== 42 + RANDOM_VECTORS) {
      throw new Error(`want ${42 + RANDOM_VECTORS} vectors, got ${rs.length}`);
    }
    const bad: string[] = [];
    for (const r of rs) {
      const want = String(toF64(r.bits));
      if (r.vl !== want) bad.push(`bits=${r.bits} want=${want} got=${r.vl}`);
    }
    if (bad.length > 0) {
      throw new Error(
        `toString disagrees with String(v) on ${bad.length}/${rs.length}:\n  ` +
          bad.slice(0, 10).join("\n  "),
      );
    }
  },
});

Deno.test({
  // The round trip, bit for bit, with the two exceptions the STYLE forces and
  // the algorithm does not: `-0` renders "0" per the spec, so its sign is gone
  // before the parser sees it (JS `Number(String(-0))` is `+0` for the same
  // reason), and a NaN renders "NaN", which carries no payload — it must come
  // back A NaN, not the same one.
  name: "std:fmt: parseF64(toString(x)) is bit-identical to x (-0 → +0, NaN → a NaN)",
  ignore: !ENABLED,
  fn: async () => {
    const rs = await rows();
    const bad: string[] = [];
    for (const r of rs) {
      const x = toF64(r.bits);
      if (r.back === "NULL") {
        bad.push(`bits=${r.bits} rendered ${r.vl} and did not parse back`);
        continue;
      }
      const back = BigInt(r.back);
      if (Number.isNaN(x)) {
        if (!Number.isNaN(toF64(back))) {
          bad.push(`bits=${r.bits} (NaN) came back ${back}`);
        }
        continue;
      }
      const want = Object.is(x, -0) ? 0n : BigInt.asIntN(64, r.bits);
      if (back !== want) bad.push(`bits=${r.bits} want=${want} got=${back}`);
    }
    if (bad.length > 0) {
      throw new Error(
        `round trip lost ${bad.length}/${rs.length}:\n  ` + bad.slice(0, 10).join("\n  "),
      );
    }
  },
});

Deno.test({
  // `print(x.toString())` and `print(x)` are meant to be indistinguishable — the
  // Rust host's `js_number_to_string` says so in as many words. They are, for
  // every vector EXCEPT an exact decimal tie, where the HOST is the one that
  // deviates from the spec it cites: it re-formats digits it gets from Rust's
  // `{:e}`, and Rust breaks a tie away from even where ECMA-262 breaks it to
  // even. The double with bits 4835952189745799117 is exactly
  // 2023347301156851.25, so "…851.2" and "…851.3" are equidistant 17-digit
  // candidates; V8 and this module print the even one, the Rust host prints the
  // odd one. The same VL program therefore prints differently under the two
  // hosts for those values, which predates `std:fmt`.
  //
  // This is a PIN, not a tolerance: the divergent set is listed, so fixing the
  // host flips this test rather than silently widening the allowance. When it
  // flips, delete the list and assert equality outright.
  name: "std:fmt: print(x) matches toString(x) except at the host's known tie bug",
  ignore: !ENABLED,
  fn: async () => {
    const rs = await rows();
    const diverged: string[] = [];
    for (const r of rs) {
      if (r.host !== r.vl) diverged.push(r.bits.toString());
      // Whichever way the host went, the module followed the spec — checked in
      // the first test; here we only care that a divergence is the host's.
      if (r.host !== r.vl && r.vl !== String(toF64(r.bits))) {
        throw new Error(`bits=${r.bits}: toString also left the spec (${r.vl})`);
      }
    }
    // Measured, 2026-09-01, over these exact vectors. The value appears TWICE
    // because it is both a named special (it is the smallest witness, so it is
    // in the table on purpose) and the one pseudo-random vector in 5,000 that
    // lands on a tie. At 50,000 vectors the rate is 14 — about 0.03%.
    const PINNED = [
      "4835952189745799117",
      "4835952189745799117",
    ];
    const got = diverged.join(",");
    const want = PINNED.join(",");
    if (got !== want) {
      throw new Error(
        `the host/toString divergence set moved.\n  want: ${want}\n  got:  ${got}\n` +
          `If the Rust host's tie-break was fixed, this test should now assert ` +
          `equality on every vector and drop the pinned list.`,
      );
    }
  },
});

// ── 2. parse: agreement with `Number(s)` ────────────────────────────────────

/**
 * The exact decimal expansion of the midpoint between the double `bits` and its
 * successor — the input class that separates a correctly rounded parser from an
 * almost-correct one, because the tie-break is the only thing that decides it.
 */
const midpointDecimal = (bits: bigint): string => {
  const be = Number((bits >> 52n) & 2047n);
  const frac = bits & 0xF_FFFF_FFFF_FFFFn;
  const m = be === 0 ? frac : frac + (1n << 52n);
  const e = be === 0 ? -1074 : be - 1075;
  // value = m·2^e, successor = (m+1)·2^e, midpoint = (2m+1)·2^(e-1).
  const num = 2n * m + 1n;
  const shift = e - 1;
  if (shift >= 0) return (num << BigInt(shift)).toString();
  const scale = -shift;
  const digits = (num * 5n ** BigInt(scale)).toString().padStart(scale + 1, "0");
  return `${digits.slice(0, digits.length - scale)}.${digits.slice(digits.length - scale)}`;
};

/** A deterministic pile of decimal strings, weighted at the hard cases. */
const parseCases = (): string[] => {
  const out: string[] = [
    // The brief's list, and the classic literals around it.
    "5e-324",
    "2.2250738585072011e-308",
    "2.2250738585072012e-308",
    "2.2250738585072013e-308",
    "1e23",
    "9007199254740993",
    "9007199254740992",
    "9007199254740995",
    "0.1",
    "1.7976931348623157e308",
    "1.7976931348623158e308",
    "1.7976931348623159e308",
    "-0",
    "0",
    "NaN",
    "Infinity",
    "-Infinity",
    "1e309",
    "-1e309",
    "1e-400",
    "-1e-400",
    "0.0",
    "00.0",
    "007",
    "1E5",
    "1e+5",
    "1e-5",
    "1.5e0",
    "1e-323",
    "2.4703282292062327e-324",
    "2.4703282292062328e-324",
    "4.9406564584124654e-324",
    "123456789012345678901234567890",
    "0.000000000000000000000000000000000000000001",
    "9223372036854775807",
    "18446744073709551616",
    "1" + "0".repeat(308),
    "1" + "0".repeat(309),
    "0." + "0".repeat(323) + "5",
    "0." + "0".repeat(324) + "5",
    "1.00000000000000000000000000000000000001",
    "0.30000000000000004",
    "8.98846567431158e307",
  ];
  for (const s of [...out]) {
    if (!s.startsWith("-") && s !== "NaN") out.push("-" + s);
  }
  // Exact midpoints and their neighbourhood, over a deterministic sample of
  // doubles: the tie itself (round half to EVEN), one decimal step above it
  // (round up), 900 zeros appended (the truncation path, still a tie), and the
  // same with a far-away 1 (a tie the truncation flag must break upward).
  const rnd = xorshift64(1234567891234567n);
  // 63 bits, not 62: masking to 62 caps the exponent field at 1023, which would put
  // EVERY midpoint below 2^-52 and leave the whole large-magnitude half of the format
  // untested by this class. 63 bits reaches the full positive range, and the `be === 2047`
  // skip drops the handful that land on an infinity or a NaN.
  for (let i = 0; i < 60; i++) {
    const bits = BigInt.asUintN(63, rnd.next().value as bigint);
    const be = Number((bits >> 52n) & 2047n);
    if (be === 2047) continue;
    const mid = midpointDecimal(bits);
    // The tail has to be appended WITHOUT moving the value, or it stops being a tie and
    // stops exercising the truncation flag: an integer midpoint gets a radix point first,
    // because `mid + "000…"` would multiply it by 10^900 instead.
    const tail = mid.includes(".") ? "0".repeat(900) : "." + "0".repeat(900);
    out.push(mid, mid + "1", mid + tail, mid + tail + "1");
    if (!mid.includes(".")) out.push(mid + ".5", mid + ".4999999999999999999");
  }
  // Plain pseudo-random decimals across the whole exponent range.
  for (let i = 0; i < 3000; i++) {
    const a = BigInt.asUintN(32, rnd.next().value as bigint);
    const nd = 1 + Number(a % 25n);
    let digits = "";
    for (let k = 0; k < nd; k++) {
      digits += String(Number(BigInt.asUintN(32, rnd.next().value as bigint) % 10n));
    }
    const b = Number(BigInt.asUintN(32, rnd.next().value as bigint));
    let s = digits;
    if (nd > 1 && b % 2 === 0) {
      const at = 1 + (b % (nd - 1));
      s = digits.slice(0, at) + "." + digits.slice(at);
    }
    if (b % 4 !== 0) s += "e" + (Number(BigInt.asUintN(32, rnd.next().value as bigint) % 700n) - 350);
    if (b % 3 === 0) s = "-" + s;
    out.push(s);
  }
  return out;
};

/** Inputs this module's grammar refuses; each must come back `null`. */
const REJECTS = [
  "",
  "1.",
  ".5",
  "+1",
  "+1.5",
  "1e",
  "1e+",
  "1e-",
  "1x",
  " 1",
  "1 ",
  "--1",
  "-",
  "0x10",
  "1_000",
  "-NaN",
  "nan",
  "NAN",
  "inf",
  "INF",
  "Infinity ",
  "Infinit",
  "InfinityX",
  "NaNN",
  "1..2",
  "1.2.3",
  "e5",
  "1e2e3",
  "1,5",
  ".",
  "-.5",
  "1.e5",
  "\t1",
];

// Every case is prefixed with `>` in the side file so that the EMPTY string is
// a line rather than nothing; the probe slices the marker off.
const PARSE_SRC = (dir: string) => `import { parseF64, toString } from "std:fmt"
import { IoError, readTextFile } from "std:fs"

const txt = readTextFile("${dir}/cases.txt")
if txt is IoError {
  print("IOERR " + txt.msg)
} else {
  let start = 0
  while start < txt.length {
    let end = start
    while end < txt.length && txt[end] != 10 { end = end + 1 }
    const s = txt.slice(start + 1, end)
    const v = parseF64(s)
    if v is null {
      print("NULL")
    } else {
      print(f64bits(v).toString())
    }
    start = end + 1
  }
}
`;

Deno.test({
  // Correct rounding, graded against `Number(s)` — itself specified as the
  // correctly rounded value — over the brief's hard literals, exact midpoints
  // between adjacent doubles (with and without a 900-digit truncated tail), the
  // subnormal boundary, overflow and underflow, and 3,000 pseudo-random
  // decimals across the whole exponent range.
  name: "std:fmt: parseF64 agrees with Number(s) on every accepted input",
  ignore: !ENABLED,
  fn: async () => {
    const cases = parseCases();
    const lines = await run(PARSE_SRC, {
      "cases.txt": cases.map((c) => ">" + c).join("\n") + "\n",
    });
    if (lines.length !== cases.length) {
      throw new Error(`want ${cases.length} answers, got ${lines.length}: ${lines[0]}`);
    }
    const bad: string[] = [];
    for (let i = 0; i < cases.length; i++) {
      const want = bitsOf(Number(cases[i]));
      if (lines[i] === "NULL") {
        bad.push(`${cases[i].slice(0, 60)} → null, want ${want}`);
        continue;
      }
      if (BigInt(lines[i]) !== want) {
        bad.push(`${cases[i].slice(0, 60)} want=${want} got=${lines[i]}`);
      }
    }
    if (bad.length > 0) {
      throw new Error(
        `parseF64 disagrees with the oracle on ${bad.length}/${cases.length}:\n  ` +
          bad.slice(0, 10).join("\n  "),
      );
    }
  },
});

Deno.test({
  // The grammar's edges, which are DELIBERATELY narrower than `Number(s)`:
  // no leading `+`, no surrounding whitespace, no bare `1.` or `.5` (VL's own
  // lexer refuses both), no hex, no separators, no lowercase `nan`/`inf`. A
  // caller with a scruffier dialect trims and rewrites first.
  name: "std:fmt: parseF64 refuses everything outside its stated grammar",
  ignore: !ENABLED,
  fn: async () => {
    const lines = await run(PARSE_SRC, {
      "cases.txt": REJECTS.map((c) => ">" + c).join("\n") + "\n",
    });
    if (lines.length !== REJECTS.length) {
      throw new Error(`want ${REJECTS.length} answers, got ${lines.length}: ${lines[0]}`);
    }
    const bad: string[] = [];
    for (let i = 0; i < REJECTS.length; i++) {
      if (lines[i] !== "NULL") {
        bad.push(`${JSON.stringify(REJECTS[i])} → ${lines[i]}, want null`);
      }
    }
    if (bad.length > 0) {
      throw new Error(`accepted ${bad.length} inputs it should refuse:\n  ` + bad.join("\n  "));
    }
  },
});
