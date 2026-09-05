// `std:bytes` against `DataView`, plus the edges its header promises: the last
// valid offset, a top-bit-set value at every width, and what an offset off
// either end does.
//
// THE ORACLE IS `DataView`, which is the platform's own byte reader and not a
// second implementation written here to agree with the first. The buffer crosses
// into the VL program as a `u8[]` literal and comes back as one printed number
// per (export, offset), so nothing about the comparison depends on the two sides
// sharing a shift expression.
//
// The `vl_` prefix is load-bearing: it is one of the globs `ci-native`
// auto-discovers (tests/ci_seed_coverage_test.ts), and a seed-backed test
// matching neither glob nor an explicit ci.yml step runs nowhere in CI.
//
// GATING: env-gated (`SELFHOST_NATIVE_ALIGN=1`) AND requires the built binary +
// seed wasm, so it self-ignores on a fresh clone and runs in `ci-native`.
//
// @test-timing native

import { COMPILER, exists, nativeEnv, VL } from "./support/tree.ts";

const GATED = Deno.env.get("SELFHOST_NATIVE_ALIGN") === "1";
const ENABLED = GATED && exists(VL) && exists(COMPILER);
if (GATED && !ENABLED) {
  console.warn("[vl-std-bytes] skipped — missing vl binary or seed wasm.");
}

/** `vl run` on one generated program. Returns stdout's lines and the exit code;
 * the trap test needs a failing run, so a non-zero code is not thrown here. */
const run = async (
  src: string,
): Promise<{ code: number; out: string[]; err: string }> => {
  const dir = await Deno.makeTempDir({ prefix: "vl_bytes_" });
  try {
    const entry = `${dir}/probe.vl`;
    await Deno.writeTextFile(entry, src);
    const { code, stdout, stderr } = await new Deno.Command(VL, {
      args: ["run", entry, "--compiler", COMPILER],
      stdout: "piped",
      stderr: "piped",
      env: nativeEnv({ NO_COLOR: "1" }),
    }).output();
    const dec = new TextDecoder();
    const out = dec.decode(stdout).split("\n").slice(0, -1);
    return { code, out, err: dec.decode(stderr) };
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
};

// 24 bytes chosen so every width has a top-bit-set reading somewhere: 0x7F80 and
// 0xFFFE at 16, 0x80000000 at 32 (offset 8, little-endian) and 0x8000000000000000
// at 64 (offset 8, big-endian), with an unaligned tail so nothing lands only on a
// multiple of its own width.
const DATA = [
  0x00, 0x01, 0x7f, 0x80,
  0xff, 0xfe, 0x81, 0x7f,
  0x00, 0x00, 0x00, 0x80,
  0x00, 0x00, 0x00, 0x00,
  0x12, 0x34, 0x56, 0x78,
  0x9a, 0xbc, 0xde, 0xf0,
];

const LIST = `const b: u8[] = [${DATA.join(", ")}]`;

/** Each export, the bytes it reads, and the `DataView` call that answers for it.
 * `width` drives both the last-valid offset and the oracle. */
const READS: {
  name: string;
  width: number;
  oracle: (v: DataView, off: number) => string;
}[] = [
  { name: "u16le", width: 2, oracle: (v, o) => String(v.getUint16(o, true)) },
  { name: "u16be", width: 2, oracle: (v, o) => String(v.getUint16(o, false)) },
  { name: "i16le", width: 2, oracle: (v, o) => String(v.getInt16(o, true)) },
  { name: "i16be", width: 2, oracle: (v, o) => String(v.getInt16(o, false)) },
  { name: "i32le", width: 4, oracle: (v, o) => String(v.getInt32(o, true)) },
  { name: "i32be", width: 4, oracle: (v, o) => String(v.getInt32(o, false)) },
  { name: "i64le", width: 8, oracle: (v, o) => String(v.getBigInt64(o, true)) },
  { name: "i64be", width: 8, oracle: (v, o) => String(v.getBigInt64(o, false)) },
];

const ALL_NAMES = READS.map((r) => r.name).join(", ");

/** Offset 0, three interior offsets (one of them odd, so no read is aligned by
 * accident), and the LAST offset at which `width` bytes still fit. */
const offsetsFor = (width: number): number[] => {
  const last = DATA.length - width;
  const set = new Set([0, 1, 5, 9, last]);
  return [...set].filter((o) => o >= 0 && o <= last).sort((a, b) => a - b);
};

Deno.test({
  // Every export at offset 0, three interior offsets and its last valid one,
  // graded against DataView — 40 readings in one program.
  name: "std:bytes: every width and byte order agrees with DataView",
  ignore: !ENABLED,
  fn: async () => {
    const view = new DataView(new Uint8Array(DATA).buffer);
    const lines: string[] = [];
    const want: string[] = [];
    const label: string[] = [];
    for (const r of READS) {
      for (const off of offsetsFor(r.width)) {
        lines.push(`print(b.${r.name}(${off}))`);
        want.push(r.oracle(view, off));
        label.push(`${r.name}(${off})`);
      }
    }
    const { code, out, err } = await run(
      `import { ${ALL_NAMES} } from "std:bytes"\n${LIST}\n${lines.join("\n")}\n`,
    );
    if (code !== 0) throw new Error(`\`vl run\` exited ${code}\n${err}`);
    if (out.length !== want.length) {
      throw new Error(`want ${want.length} lines, got ${out.length}: ${out[0]}`);
    }
    const bad: string[] = [];
    for (let i = 0; i < want.length; i++) {
      if (out[i] !== want[i]) {
        bad.push(`${label[i]} want=${want[i]} got=${out[i]}`);
      }
    }
    if (bad.length > 0) {
      throw new Error(
        `${bad.length} of ${want.length} readings disagree with DataView:\n  ` +
          bad.join("\n  "),
      );
    }
  },
});

Deno.test({
  // The header's delivery rule, spelled out rather than derived: 16 bits fit an
  // i32 two ways so `u16le` and `i16le` differ on the same bytes, while 32 and 64
  // bits fill their return type and a top-bit-set word simply reads negative.
  name: "std:bytes: a top-bit-set value at each width, as the header documents",
  ignore: !ENABLED,
  fn: async () => {
    // Two all-ones bytes, then 2^63 spelled little-endian, then 2^63 spelled
    // big-endian — so every width has a top-bit-set reading at one order or the
    // other, and each expectation below is checkable by eye from those bytes.
    const cases: [string, string][] = [
      ["u16le(0)", "65535"],
      ["i16le(0)", "-1"],
      ["u16be(0)", "65535"],
      ["i16be(0)", "-1"],
      ["u16le(8)", "32768"],
      ["i16le(8)", "-32768"],
      ["u16be(10)", "32768"],
      ["i16be(10)", "-32768"],
      ["i32le(6)", "-2147483648"],
      ["i32be(10)", "-2147483648"],
      ["i64le(2)", "-9223372036854775808"],
      ["i64be(10)", "-9223372036854775808"],
      // and the widen-and-mask the header prescribes for a u32 as a NUMBER,
      // beside the mistake it warns about: `& 0xffffffff` on the i32 is the
      // identity, and five files in the first codebase to want this shipped it.
      ["i32le(6) as i64 & 0xffffffff", "2147483648"],
      ["i32le(6) & 0xffffffff (the no-op)", "-2147483648"],
    ];
    const src = `import { ${ALL_NAMES} } from "std:bytes"
const b: u8[] = [
  0xFF, 0xFF,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x80,
  0x80, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
]
print(b.u16le(0))
print(b.i16le(0))
print(b.u16be(0))
print(b.i16be(0))
print(b.u16le(8))
print(b.i16le(8))
print(b.u16be(10))
print(b.i16be(10))
print(b.i32le(6))
print(b.i32be(10))
print(b.i64le(2))
print(b.i64be(10))
print((b.i32le(6) as i64) & 0xffffffff)
print(b.i32le(6) & 0xffffffff)
`;
    const { code, out, err } = await run(src);
    if (code !== 0) throw new Error(`\`vl run\` exited ${code}\n${err}`);
    if (out.length !== cases.length) {
      throw new Error(`want ${cases.length} lines, got ${out.length}: ${out[0]}`);
    }
    const bad: string[] = [];
    for (let i = 0; i < cases.length; i++) {
      if (out[i] !== cases[i][1]) {
        bad.push(`${cases[i][0]} want=${cases[i][1]} got=${out[i]}`);
      }
    }
    if (bad.length > 0) {
      throw new Error(`${bad.length} readings are wrong:\n  ` + bad.join("\n  "));
    }
  },
});

Deno.test({
  // The header says an offset off either end traps in the list's own bounds
  // check and that nothing answers 0 for a short read. Both directions, at every
  // width: one past the last valid offset, and a negative one.
  name: "std:bytes: an offset off either end traps rather than answering 0",
  ignore: !ENABLED,
  fn: async () => {
    const bad: string[] = [];
    for (const r of READS) {
      const past = DATA.length - r.width + 1;
      for (const [what, off] of [["past the end", past], ["negative", -1]] as const) {
        const arg = off < 0 ? "0 - 1" : String(off);
        const { code, out, err } = await run(
          `import { ${r.name} } from "std:bytes"\n${LIST}\nprint(b.${r.name}(${arg}))\n`,
        );
        if (code === 0) {
          bad.push(`${r.name} ${what} (off ${off}) did not trap — printed ${out[0]}`);
        } else if (!err.includes("out of bounds array access")) {
          bad.push(
            `${r.name} ${what} (off ${off}) failed without the bounds trap: ${
              err.split("\n").find((l) => l.trim().length > 0) ?? ""
            }`,
          );
        }
      }
    }
    if (bad.length > 0) {
      throw new Error(`${bad.length} out-of-range reads were wrong:\n  ` + bad.join("\n  "));
    }
  },
});

Deno.test({
  // The composition the header prescribes instead of a `f32le` / `f64le` family:
  // the bitcast intrinsics over the integer read. 1.0f and 1.0 at both orders.
  name: "std:bytes: a float is f32fromBits / f64fromBits over the integer read",
  ignore: !ENABLED,
  fn: async () => {
    const src = `import { i32le, i32be, i64le, i64be } from "std:bytes"
const le: u8[] = [0x00, 0x00, 0x80, 0x3F, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0xF0, 0x3F]
const be: u8[] = [0x3F, 0x80, 0x00, 0x00, 0x3F, 0xF0, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]
print(f32fromBits(le.i32le(0)))
print(f64fromBits(le.i64le(4)))
print(f32fromBits(be.i32be(0)))
print(f64fromBits(be.i64be(4)))
`;
    const { code, out, err } = await run(src);
    if (code !== 0) throw new Error(`\`vl run\` exited ${code}\n${err}`);
    const want = ["1", "1", "1", "1"];
    if (out.join(",") !== want.join(",")) {
      throw new Error(`want ${want.join(",")}, got ${out.join(",")}`);
    }
  },
});
