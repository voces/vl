// `std:base64` against RFC 4648's own test vectors, a deterministic round-trip
// fuzz, and the four ways a decode is refused.
//
// THE ENCODE ORACLE IS `btoa`, which is the platform's base64 and not a second
// implementation written here to agree with the first. Byte arrays cross into
// the VL program as hex on one side and come back as base64 on the other, so
// nothing about the comparison depends on the two sides sharing a generator.
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
  console.warn("[vl-std-base64] skipped — missing vl binary or seed wasm.");
}

const run = async (
  src: (dir: string) => string,
  extra: Record<string, string> = {},
): Promise<string[]> => {
  const dir = await Deno.makeTempDir({ prefix: "vl_base64_" });
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
      // VL_STD pins the std dir to THIS tree — see tests/vl_std_args_test.ts.
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

const hex = (bytes: number[]): string =>
  bytes.map((b) => b.toString(16).padStart(2, "0")).join("");

const b64 = (bytes: number[]): string => btoa(String.fromCharCode(...bytes));

// A line per case: hex in, and the probe prints the base64 out, then re-decodes
// its own output and prints the hex it got back. Two lines per case, so a
// failing round trip is visible beside the encoding that produced it.
const ENCODE_SRC = (dir: string) => `import { Base64Error, decodeBase64, encodeBase64 } from "std:base64"
import { IoError, readTextFile } from "std:fs"

function hexVal(c: i32): i32 {
  if c >= 48 && c <= 57 { return c - 48 }
  if c >= 97 && c <= 102 { return c - 97 + 10 }
  -1
}

function hexOf(b: u8[]): string {
  const out: i32[] = []
  let i = 0
  while i < b.length {
    const hi = b[i] >> 4
    const lo = b[i] & 15
    if hi < 10 { out.push(48 + hi) } else { out.push(97 + hi - 10) }
    if lo < 10 { out.push(48 + lo) } else { out.push(97 + lo - 10) }
    i = i + 1
  }
  fromCodePoints(out)
}

const txt = readTextFile("${dir}/bytes.txt")
if txt is IoError {
  print("IOERR " + txt.msg)
} else {
  let start = 0
  while start < txt.length {
    let end = start
    while end < txt.length && txt[end] != 10 { end = end + 1 }
    const bytes: u8[] = []
    let i = start + 1
    while i + 1 < end {
      bytes.push(hexVal(txt[i]) * 16 + hexVal(txt[i + 1]))
      i = i + 2
    }
    const enc = encodeBase64(bytes)
    print(enc)
    const back = decodeBase64(enc)
    if back is Base64Error {
      print("ERR " + back.kind)
    } else {
      print(hexOf(back))
    }
    start = end + 1
  }
}
`;

const DECODE_SRC = (dir: string) => `import { Base64Error, decodeBase64 } from "std:base64"
import { IoError, readTextFile } from "std:fs"
import { toString } from "std:fmt"

function hexOf(b: u8[]): string {
  const out: i32[] = []
  let i = 0
  while i < b.length {
    const hi = b[i] >> 4
    const lo = b[i] & 15
    if hi < 10 { out.push(48 + hi) } else { out.push(97 + hi - 10) }
    if lo < 10 { out.push(48 + lo) } else { out.push(97 + lo - 10) }
    i = i + 1
  }
  fromCodePoints(out)
}

const txt = readTextFile("${dir}/cases.txt")
if txt is IoError {
  print("IOERR " + txt.msg)
} else {
  let start = 0
  while start < txt.length {
    let end = start
    while end < txt.length && txt[end] != 10 { end = end + 1 }
    const s = txt.slice(start + 1, end)
    const r = decodeBase64(s)
    if r is Base64Error {
      print("ERR " + r.kind + " " + r.at.toString())
    } else {
      print("OK " + hexOf(r))
    }
    start = end + 1
  }
}
`;

/** RFC 4648 §10, verbatim. */
const RFC_VECTORS: [string, string][] = [
  ["", ""],
  ["f", "Zg=="],
  ["fo", "Zm8="],
  ["foo", "Zm9v"],
  ["foob", "Zm9vYg=="],
  ["fooba", "Zm9vYmE="],
  ["foobar", "Zm9vYmFy"],
];

/** A deterministic pile of byte arrays: every short length, then longer ones. */
const fuzzCases = (): number[][] => {
  const out: number[][] = [];
  // All 256 single bytes, and every length from 0 to 40, so each of the three
  // tail shapes (0, 1, 2 leftover bytes) is hit many times.
  for (let b = 0; b < 256; b++) out.push([b]);
  // xorshift32 over 32-bit integer ops — exact in a Number, so the sequence is
  // the same on every platform without reaching for BigInt.
  let s = 0x2545f491;
  const next = (): number => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return s;
  };
  for (let len = 0; len <= 40; len++) {
    for (let rep = 0; rep < 6; rep++) {
      const a: number[] = [];
      for (let i = 0; i < len; i++) a.push(next() & 255);
      out.push(a);
    }
  }
  for (const len of [64, 100, 255, 256, 257, 1000, 3001]) {
    const a: number[] = [];
    for (let i = 0; i < len; i++) a.push(next() & 255);
    out.push(a);
  }
  return out;
};

Deno.test({
  // The specification's own vectors, both directions, in the order the RFC
  // prints them — the one test that is a quotation rather than a computation.
  name: "std:base64: RFC 4648 §10 test vectors, encode and decode",
  ignore: !ENABLED,
  fn: async () => {
    const bytes = RFC_VECTORS.map(([plain]) =>
      [...plain].map((c) => c.charCodeAt(0))
    );
    const lines = await run(ENCODE_SRC, {
      "bytes.txt": bytes.map((b) => ">" + hex(b)).join("\n") + "\n",
    });
    if (lines.length !== 2 * RFC_VECTORS.length) {
      throw new Error(`want ${2 * RFC_VECTORS.length} lines, got ${lines.length}: ${lines[0]}`);
    }
    for (let i = 0; i < RFC_VECTORS.length; i++) {
      const [plain, want] = RFC_VECTORS[i];
      const got = lines[2 * i];
      if (got !== want) {
        throw new Error(`encodeBase64(${JSON.stringify(plain)}) want=${want} got=${got}`);
      }
      const back = lines[2 * i + 1];
      if (back !== hex(bytes[i])) {
        throw new Error(`decodeBase64(${want}) want=${hex(bytes[i])} got=${back}`);
      }
    }
  },
});

Deno.test({
  // Agreement with the platform encoder over every short length and a spread of
  // long ones, plus the round trip back through this module's own decoder. The
  // per-length sweep is what covers the three tail shapes; single bytes cover
  // the whole alphabet's low-order half.
  name: "std:base64: encode matches btoa, and decode inverts it exactly",
  ignore: !ENABLED,
  fn: async () => {
    const cases = fuzzCases();
    const lines = await run(ENCODE_SRC, {
      "bytes.txt": cases.map((b) => ">" + hex(b)).join("\n") + "\n",
    });
    if (lines.length !== 2 * cases.length) {
      throw new Error(`want ${2 * cases.length} lines, got ${lines.length}: ${lines[0]}`);
    }
    const bad: string[] = [];
    for (let i = 0; i < cases.length; i++) {
      const want = b64(cases[i]);
      if (lines[2 * i] !== want) {
        bad.push(`len=${cases[i].length} want=${want.slice(0, 40)} got=${lines[2 * i].slice(0, 40)}`);
      }
      if (lines[2 * i + 1] !== hex(cases[i])) {
        bad.push(`len=${cases[i].length} round trip lost: ${lines[2 * i + 1].slice(0, 40)}`);
      }
    }
    if (bad.length > 0) {
      throw new Error(
        `${bad.length} of ${cases.length} disagreed:\n  ` + bad.slice(0, 10).join("\n  "),
      );
    }
  },
});

Deno.test({
  // Every refusal the module documents, with the `kind` and the offset it
  // promises. Canonicality is the interesting column: `"QR=="` names the same
  // byte as `"QQ=="` with junk in the bits past the end, and rejecting it is
  // what makes decode-then-encode an identity.
  name: "std:base64: decode refuses non-canonical input, with the stated kind and offset",
  ignore: !ENABLED,
  fn: async () => {
    const cases: [string, string][] = [
      ["Zm8", "length 3"],
      ["Zm8==", "length 5"],
      ["Z m8=", "length 5"],
      ["Zm9v\tZm9v", "length 9"],
      ["Zm9vé", "length 6"],
      ["Zm9?", "character 3"],
      ["?m9v", "character 0"],
      ["Z-9v", "character 1"],
      ["-_-_", "character 0"],
      ["Zm9_", "character 3"],
      ["====", "padding 0"],
      ["Z===", "padding 1"],
      ["Zg==Zg==", "padding 2"],
      ["Zg=Z", "padding 3"],
      ["QR==", "bits 1"],
      ["QQ=A", "padding 3"],
      ["Zm9x=", "length 5"],
      ["Zm9=", "bits 2"],
      ["    ", "character 0"],
      // and the ones that must NOT be refused
      ["", "OK "],
      ["QQ==", "OK 41"],
      ["Zm8=", "OK 666f"],
      ["////", "OK ffffff"],
      ["++++", "OK fbefbe"],
      ["AAAA", "OK 000000"],
    ];
    const lines = await run(DECODE_SRC, {
      "cases.txt": cases.map(([s]) => ">" + s).join("\n") + "\n",
    });
    if (lines.length !== cases.length) {
      throw new Error(`want ${cases.length} answers, got ${lines.length}: ${lines[0]}`);
    }
    const bad: string[] = [];
    for (let i = 0; i < cases.length; i++) {
      const [input, want] = cases[i];
      const got = lines[i].startsWith("ERR ") ? lines[i].slice(4) : lines[i];
      if (got !== want) bad.push(`${JSON.stringify(input)} want=${want} got=${got}`);
    }
    if (bad.length > 0) {
      throw new Error(`${bad.length} refusals were wrong:\n  ` + bad.join("\n  "));
    }
  },
});
