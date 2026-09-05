// `std:fmt`'s integer text halves — `parseI64` and `parseI32`, the exact
// inverses of `toString` over the two integer widths — graded against a BigInt
// oracle written from the GRAMMAR rather than from the implementation.
//
// WHY AN ORACLE AND NOT A TABLE OF EXPECTED VALUES. The interesting inputs are
// the ones at the boundaries (i64 min, one past i64 max, one past each i32
// edge), and a hand-typed expected column at those is exactly where a typo
// looks like a pass. `want64`/`want32` below re-derive the answer from the
// stated rule — `"-"? digit+`, then an inclusive range test in arbitrary
// precision — so the test agrees with the SPEC, not with the code. The one
// place a literal table is right is the reject list, where the expected answer
// is `null` and cannot be mistyped.
//
// The round-trip probe grades BOTH directions at once: the TS side mirrors the
// VL side's xorshift64, so it knows which i64 the VL program rendered and can
// check the rendering against `BigInt.toString()` before checking that
// `parseI64` reads it back. A round trip that only compares VL against itself
// would pass with both halves broken the same way.
//
// The `vl_` prefix is load-bearing: it is one of the globs `ci-native`
// auto-discovers (tests/ci_seed_coverage_test.ts), and a seed-backed test
// matching neither glob nor an explicit ci.yml step runs nowhere in CI.
//
// GATING: env-gated (`SELFHOST_NATIVE_ALIGN=1`) AND requires the built binary +
// seed wasm, so it self-ignores on a fresh clone and runs in `ci-native`.
//
// @test-timing native

import { COMPILER, ROOT, VL, exists } from "./support/tree.ts";

const STD = `${ROOT}/std`;

const GATED = Deno.env.get("SELFHOST_NATIVE_ALIGN") === "1";
const ENABLED = GATED && exists(VL) && exists(COMPILER);
if (GATED && !ENABLED) {
  console.warn("[vl-std-int-text] skipped — missing vl binary or seed wasm.");
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
  const dir = await Deno.makeTempDir({ prefix: "vl_int_text_" });
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

// ── the oracle ──────────────────────────────────────────────────────────────

const I64_MIN = -(2n ** 63n);
const I64_MAX = 2n ** 63n - 1n;
const I32_MIN = -(2n ** 31n);
const I32_MAX = 2n ** 31n - 1n;

/**
 * The module's grammar: an optional MINUS, then one or more ASCII digits. A
 * leading "+" is refused — the grammar is a strict subset of `parseF64`'s, so
 * that choosing between the two exports is a choice of type and never of
 * dialect.
 */
const GRAMMAR = /^-?[0-9]+$/;

const inRange = (s: string, lo: bigint, hi: bigint): bigint | null => {
  if (!GRAMMAR.test(s)) return null;
  const v = BigInt(s);
  return v >= lo && v <= hi ? v : null;
};

const want64 = (s: string): bigint | null => inRange(s, I64_MIN, I64_MAX);
const want32 = (s: string): bigint | null => inRange(s, I32_MIN, I32_MAX);

// ── the case list ───────────────────────────────────────────────────────────

/**
 * Every input the two parsers are claimed to accept, plus every boundary. The
 * oracle above decides what each one means, including which of them `parseI32`
 * must refuse while `parseI64` accepts.
 */
const ACCEPTED = [
  // plain
  "0",
  "1",
  "42",
  "-1",
  "-42",
  "1234567890",
  "-1234567890",
  // "-0" is 0: there is no negative zero integer
  "-0",
  "-00",
  // leading zeros are accepted, matching Number and every strtol
  "007",
  "0000000000000000000000042",
  "-007",
  "0000000000000000000000000",
  // i32 boundaries, and one past each — parseI32 must refuse the outer two
  // while parseI64 reads them fine
  "2147483646",
  "2147483647",
  "2147483648",
  "-2147483647",
  "-2147483648",
  "-2147483649",
  "4294967295",
  "4294967296",
  // i64 boundaries, and one past each
  "9223372036854775806",
  "9223372036854775807",
  "9223372036854775808",
  "9223372036854775809",
  "-9223372036854775807",
  "-9223372036854775808",
  "-9223372036854775809",
  "-9223372036854775810",
  // far past, including the u64 wrap point and enough digits that a
  // single-wrap sign check would be fooled
  "18446744073709551615",
  "18446744073709551616",
  "99999999999999999999999999",
  "-99999999999999999999999999",
  "340282366920938463463374607431768211456",
  // a long leading-zero run in front of an in-range value: the zeros must not
  // trip the overflow guards
  "00000000000000000000009223372036854775807",
  "-00000000000000000000009223372036854775808",
  // 2^53 and its neighbours — the values the parseF64 funnel loses, and the
  // whole reason these two exports exist
  "9007199254740992",
  "9007199254740993",
  "9007199254740994",
];

/**
 * Inputs outside the stated grammar. Every one is `null` from BOTH parsers, and
 * the oracle independently says so — the list is here so a failure names the
 * spelling rather than an index.
 */
const REJECTS = [
  "",
  "-",
  // A leading "+" is refused at every spelling, including the ones `Number`,
  // `strtol` and Rust all accept — the grammar is a strict subset of
  // `parseF64`'s, which has no "+" either, so std runs ONE number dialect.
  // These are the four that would flip if that rule were ever relaxed.
  "+",
  "+0",
  "+3",
  "+2147483647",
  "+9223372036854775807",
  "--1",
  "++1",
  "+-1",
  "-+1",
  "1-",
  "1+",
  "1.0",
  "1.",
  ".1",
  ".",
  "1e3",
  "1E3",
  "1e+3",
  "-1e3",
  " 1",
  "1 ",
  " ",
  "\t1",
  "1\t",
  "0x10",
  "0X10",
  "0b101",
  "0o17",
  "1_000",
  "1,000",
  "abc",
  "1a",
  "a1",
  "NaN",
  "Infinity",
  "-Infinity",
  "１２３", // full-width digits are not ASCII digits
  "१२३", // Devanagari digits likewise
  "1 2",
  "٣",
];

const CASES = [...ACCEPTED, ...REJECTS];

// Every case is prefixed with `>` in the side file so that the EMPTY string is
// a line rather than nothing; the probe slices the marker off. Two answer lines
// per case: `parseI64` then `parseI32`.
const PARSE_SRC = (dir: string) => `import { parseI32, parseI64, toString } from "std:fmt"
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
    const a = parseI64(s)
    if a is null { print("NULL") } else { print(toString(a)) }
    const b = parseI32(s)
    if b is null { print("NULL") } else { print(toString(b)) }
    start = end + 1
  }
}
`;

let cachedAnswers: string[] | null = null;
const answers = async (): Promise<string[]> => {
  if (cachedAnswers === null) {
    cachedAnswers = await run(PARSE_SRC, {
      "cases.txt": CASES.map((c) => ">" + c).join("\n") + "\n",
    });
    if (cachedAnswers.length !== CASES.length * 2) {
      throw new Error(
        `want ${CASES.length * 2} answer lines, got ${cachedAnswers.length}: ${cachedAnswers[0]}`,
      );
    }
  }
  return cachedAnswers;
};

const grade = async (
  which: "parseI64" | "parseI32",
  oracle: (s: string) => bigint | null,
): Promise<void> => {
  const lines = await answers();
  const offset = which === "parseI64" ? 0 : 1;
  const bad: string[] = [];
  for (let i = 0; i < CASES.length; i++) {
    const got = lines[i * 2 + offset];
    const w = oracle(CASES[i]);
    const want = w === null ? "NULL" : w.toString();
    if (got !== want) bad.push(`${JSON.stringify(CASES[i])} want=${want} got=${got}`);
  }
  if (bad.length > 0) {
    throw new Error(
      `${which} disagrees with the oracle on ${bad.length}/${CASES.length}:\n  ` +
        bad.join("\n  "),
    );
  }
};

Deno.test({
  // The headline claim: over the grammar's whole surface — both signs, leading
  // zeros, both widths' boundaries and one past each — `parseI64` answers
  // exactly the integer the string denotes, and `null` when it denotes none.
  // Out of range is `null` here and NOT a wrap: "9223372036854775808" must not
  // come back as i64 min.
  name: "std:fmt: parseI64 agrees with the arbitrary-precision oracle",
  ignore: !ENABLED,
  fn: () => grade("parseI64", want64),
});

Deno.test({
  // The same surface through `parseI32`, whose narrower range is the point:
  // "2147483648" and "-2147483649" are `null`, not the wrapped i32 that
  // `parseI64` followed by an unchecked `as i32` would produce.
  name: "std:fmt: parseI32 agrees with the arbitrary-precision oracle",
  ignore: !ENABLED,
  fn: () => grade("parseI32", want32),
});

Deno.test({
  // The reject list, stated separately from the oracle so a regression names
  // the spelling. These are the grammars only `parseF64` accepts, which is what
  // makes the integer one a strict SUBSET ("1.0", "1e3"), plus the ones neither
  // accepts (whitespace,
  // "0x10", digit separators, non-ASCII digits).
  name: "std:fmt: both integer parsers refuse everything outside the grammar",
  ignore: !ENABLED,
  fn: async () => {
    const lines = await answers();
    const bad: string[] = [];
    for (let i = 0; i < REJECTS.length; i++) {
      const at = (ACCEPTED.length + i) * 2;
      if (lines[at] !== "NULL") bad.push(`parseI64(${JSON.stringify(REJECTS[i])}) → ${lines[at]}`);
      if (lines[at + 1] !== "NULL") {
        bad.push(`parseI32(${JSON.stringify(REJECTS[i])}) → ${lines[at + 1]}`);
      }
    }
    if (bad.length > 0) {
      throw new Error(`accepted ${bad.length} inputs it should refuse:\n  ` + bad.join("\n  "));
    }
  },
});

// ── the subset rule ─────────────────────────────────────────────────────────

Deno.test({
  // The header's load-bearing claim about the two sibling parsers: the integer
  // grammar is a strict SUBSET of `parseF64`'s, so no string parses as an
  // integer and fails as a float. That is what makes choosing between the two
  // exports a choice of TYPE and never of dialect, and it is the property the
  // rejected leading "+" exists to preserve — so it is checked over the whole
  // case list rather than asserted in a comment.
  //
  // ACCEPTANCE only. The two deliberately disagree about the VALUE above 2^53
  // (that disagreement is why these exports exist), so this grades which
  // strings parse, never what they parse to.
  name: "std:fmt: the integer grammar is a strict subset of parseF64's",
  ignore: !ENABLED,
  fn: async () => {
    const lines = await run((dir) => `import { parseF64, parseI64 } from "std:fmt"
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
    const a = parseI64(s)
    const b = parseF64(s)
    if a is null { print("i64=no") } else { print("i64=yes") }
    if b is null { print("f64=no") } else { print("f64=yes") }
    start = end + 1
  }
}
`, { "cases.txt": CASES.map((c) => ">" + c).join("\n") + "\n" });
    if (lines.length !== CASES.length * 2) {
      throw new Error(`want ${CASES.length * 2} lines, got ${lines.length}: ${lines[0]}`);
    }
    const bad: string[] = [];
    for (let i = 0; i < CASES.length; i++) {
      const intOk = lines[i * 2] === "i64=yes";
      const floatOk = lines[i * 2 + 1] === "f64=yes";
      // The subset rule: integer-accepted implies float-accepted. The converse
      // is false on purpose ("1.0", "1e3", "Infinity") and is not checked.
      if (intOk && !floatOk) {
        bad.push(`${JSON.stringify(CASES[i])} parses as an integer but not as a float`);
      }
    }
    if (bad.length > 0) {
      throw new Error(
        `the integer grammar escaped parseF64's on ${bad.length} input(s):\n  ` +
          bad.join("\n  "),
      );
    }
  },
});

// ── the round trip ──────────────────────────────────────────────────────────

/** How many pseudo-random i64 values the round-trip probe walks. */
const RANDOM_VECTORS = 2000;

/** The one seed, reproduced in TS below so the harness knows the VL sequence. */
const SEED = "88172645463325252";

/**
 * Values named rather than sampled: both widths' extremes, the signs, and the
 * 2^53 neighbourhood where the `parseF64` funnel stops being exact.
 */
const FIXED: bigint[] = [
  0n,
  1n,
  -1n,
  9n,
  10n,
  -10n,
  I32_MAX,
  I32_MIN,
  I32_MAX + 1n,
  I32_MIN - 1n,
  9007199254740992n,
  9007199254740993n,
  -9007199254740993n,
  I64_MAX,
  I64_MAX - 1n,
  I64_MIN,
  I64_MIN + 1n,
];

/** The same xorshift64 the probe runs, so the harness can predict its output. */
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

// i64 min has no decimal literal in VL — its magnitude overflows a positive i64
// before any minus applies — so the fixed table is built from expressions. The
// `- 1` / `+ 1` spellings are how the module itself writes the bound.
const vlI64 = (v: bigint): string => {
  if (v === I64_MIN) return "-9223372036854775807 - 1";
  return v.toString();
};

const ROUNDTRIP_SRC = () => `import { parseI64, toString } from "std:fmt"

let seed: i64 = ${SEED}

// xorshift64 — deterministic, and reproduced bit for bit in the test harness.
function nextBits(): i64 {
  seed = seed ^ (seed << 13)
  seed = seed ^ (seed >>> 7)
  seed = seed ^ (seed << 17)
  seed
}

// Two lines per value: what \`toString\` rendered, and what \`parseI64\` read back
// out of that very string. The harness grades the first against BigInt and then
// requires the second to equal it.
function emit(n: i64) {
  const s = toString(n)
  print(s)
  const back = parseI64(s)
  if back is null { print("NULL") } else { print(toString(back)) }
}

${FIXED.map((v) => `emit(${vlI64(v)})`).join("\n")}

let k = 0
while k < ${RANDOM_VECTORS} {
  emit(nextBits())
  k = k + 1
}
`;

Deno.test({
  // `toString(n).parseI64() == n` for every i64 — the property the two halves
  // exist to have. Graded in three steps so a failure says WHICH half broke:
  // the rendering must equal BigInt's decimal, the parse must equal the
  // rendering, and both must hold at i64 min and max, where the module's
  // negative accumulator and its bound checks meet.
  name: "std:fmt: toString(n).parseI64() round-trips every i64 (min/max + 2000 random)",
  ignore: !ENABLED,
  fn: async () => {
    const lines = await run(ROUNDTRIP_SRC);
    const total = FIXED.length + RANDOM_VECTORS;
    if (lines.length !== total * 2) {
      throw new Error(`want ${total * 2} lines, got ${lines.length}: ${lines[0]}`);
    }
    const rnd = xorshift64(BigInt(SEED));
    const badRender: string[] = [];
    const badParse: string[] = [];
    for (let i = 0; i < total; i++) {
      const n = i < FIXED.length ? FIXED[i] : (rnd.next().value as bigint);
      const rendered = lines[i * 2];
      const back = lines[i * 2 + 1];
      if (rendered !== n.toString()) {
        badRender.push(`n=${n} toString=${rendered}`);
        continue;
      }
      if (back !== rendered) badParse.push(`n=${n} rendered=${rendered} parsed=${back}`);
    }
    if (badRender.length > 0) {
      throw new Error(
        `toString disagrees with BigInt on ${badRender.length}/${total}:\n  ` +
          badRender.slice(0, 10).join("\n  "),
      );
    }
    if (badParse.length > 0) {
      throw new Error(
        `the round trip broke on ${badParse.length}/${total}:\n  ` +
          badParse.slice(0, 10).join("\n  "),
      );
    }
  },
});

// ── the two call spellings ──────────────────────────────────────────────────

Deno.test({
  // `self`-first is the module's stated convention, and it is what makes
  // `"42".parseI64()` a method call. Both spellings must reach the SAME
  // function, at both widths and on a rejected input — a UFCS arm that silently
  // resolved elsewhere would show up here and nowhere else in this file.
  name: "std:fmt: parseI64/parseI32 answer identically as a method and as a free call",
  ignore: !ENABLED,
  fn: async () => {
    const lines = await run(() => `import { parseI32, parseI64, toString } from "std:fmt"

function show64(v: i64 | null) {
  if v is null { print("NULL") } else { print(toString(v)) }
}
function show32(v: i32 | null) {
  if v is null { print("NULL") } else { print(toString(v)) }
}

show64("42".parseI64())
show64(parseI64("42"))
show64("-9223372036854775808".parseI64())
show64(parseI64("-9223372036854775808"))
show64("1.0".parseI64())
show64(parseI64("1.0"))
show32("42".parseI32())
show32(parseI32("42"))
show32("2147483648".parseI32())
show32(parseI32("2147483648"))
`);
    const want = [
      "42",
      "42",
      "-9223372036854775808",
      "-9223372036854775808",
      "NULL",
      "NULL",
      "42",
      "42",
      "NULL",
      "NULL",
    ];
    if (lines.length !== want.length) {
      throw new Error(`want ${want.length} lines, got ${lines.length}: ${lines.join(" | ")}`);
    }
    for (let i = 0; i < want.length; i++) {
      if (lines[i] !== want[i]) {
        throw new Error(`line ${i}: want ${want[i]}, got ${lines[i]}`);
      }
    }
  },
});
