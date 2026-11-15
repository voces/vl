// The native host's `print` of an f64 against V8's `String(v)`: the shortest round-trip, the
// closest candidate, and on an exact tie the even digit (ECMA-262 `Number::toString`). The JS
// and wasm hosts sink through `String(v)` (tests/support/runWasm.ts), so this is the agreement
// that keeps a `@log` line the same under either host (D16472, D1011).
//
// The sample: every power of two from 2^-1074 to 2^1023, where the gap below is half the gap
// above, the subnormal and normal boundaries, an exact tie, and seeded random finite doubles
// and subnormals, each at both signs. A double is spelled as its two 32-bit halves, so the
// program has no negative literal.
//
// GATING: `SELFHOST_NATIVE_ALIGN=1` and the built binary + seed wasm, as the other `vl_` tests.
// No assertion library, per CLAUDE.md.
//
// @test-timing native

import { makeTempDir } from "./support/filePath.ts";
import { COMPILER, ROOT, VL, exists } from "./support/tree.ts";

const GATED = Deno.env.get("SELFHOST_NATIVE_ALIGN") === "1";
const ENABLED = GATED && exists(VL) && exists(COMPILER);
if (GATED && !ENABLED) {
  console.warn("[vl-host-float-print] skipped — missing vl binary or seed wasm.");
}

const dv = new DataView(new ArrayBuffer(8));
const toF64 = (b: bigint): number => {
  dv.setBigUint64(0, BigInt.asUintN(64, b), true);
  return dv.getFloat64(0, true);
};

// One seeded xorshift64, so the sample is the same on every run.
let state = 88172645463325252n;
const next = (): bigint => {
  state ^= (state << 13n) & 0xFFFFFFFFFFFFFFFFn;
  state ^= state >> 7n;
  state ^= (state << 17n) & 0xFFFFFFFFFFFFFFFFn;
  return state;
};

const SIGN = 0x8000000000000000n;
const EXP = 0x7FF0000000000000n;

const sample = (): bigint[] => {
  const out: bigint[] = [];
  // Every power of two: subnormal 2^-1074 .. 2^-1023, then normal 2^-1022 .. 2^1023.
  for (let i = 0n; i < 52n; i++) out.push(1n << i);
  for (let e = 1n; e <= 2046n; e++) out.push(e << 52n);
  out.push(
    0x000FFFFFFFFFFFFFn, // the largest subnormal
    0x0010000000000001n, // just above the smallest normal
    0x7FEFFFFFFFFFFFFFn, // the largest finite
    0x3FF0000000000001n, // 1 + ulp
    0x3FEFFFFFFFFFFFFFn, // 1 - ulp/2
    0x3E70000000000001n, // 2^-24 + ulp
    0x3E6FFFFFFFFFFFFFn, // 2^-24 - ulp
    4835952189745799117n, // an exact tie between two 17-digit candidates (D1011)
  );
  for (let i = 0; i < 3000; i++) {
    const b = next();
    if ((b & EXP) !== EXP) out.push(b & ~SIGN);
  }
  for (let i = 0; i < 500; i++) out.push(next() & 0x000FFFFFFFFFFFFFn);
  return [...out, ...out.map((b) => b | SIGN)];
};

Deno.test({
  name: "host float print: the native `print` of an f64 is V8's `String(v)`, bit for bit",
  ignore: !ENABLED,
  fn: async () => {
    const bits = sample();
    const pairs = bits.map((b) => `${b >> 32n}, ${b & 0xFFFFFFFFn}`).join(",\n  ");
    const src = `const xs: i64[] = [\n  ${pairs},\n]
let i = 0
while i < xs.length {
  print(f64fromBits((xs[i] << 32) | xs[i + 1]))
  i = i + 2
}
`;
    const dir = await makeTempDir({ prefix: "vl_host_float_print_" });
    try {
      const entry = `${dir}/probe.vl`;
      await Deno.writeTextFile(entry, src);
      const { code, stdout, stderr } = await new Deno.Command(VL, {
        args: ["run", entry, "--compiler", COMPILER],
        stdout: "piped",
        stderr: "piped",
        env: { RUST_BACKTRACE: "0", NO_COLOR: "1", VL_STD: `${ROOT}/std` },
      }).output();
      const dec = new TextDecoder();
      if (code !== 0) {
        throw new Error(`\`vl run\` exited ${code}:\n${dec.decode(stderr)}`);
      }
      const got = dec.decode(stdout).split("\n").slice(0, -1);
      if (got.length !== bits.length) {
        throw new Error(`want ${bits.length} lines, got ${got.length}`);
      }
      const bad: string[] = [];
      bits.forEach((b, i) => {
        const want = String(toF64(b));
        if (got[i] !== want) bad.push(`bits ${b}: want ${want}, got ${got[i]}`);
      });
      if (bad.length > 0) {
        throw new Error(
          `${bad.length} of ${bits.length} differ from String(v):\n${bad.slice(0, 20).join("\n")}`,
        );
      }
    } finally {
      await Deno.remove(dir, { recursive: true });
    }
  },
});
