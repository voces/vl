// A SOURCE LARGER THAN 8M CODE POINTS COMPILES, WHOLE AND IN ORDER (D1975, reported by
// plumb as PL-002).
//
// The compile store runs under the null collector, whose largest single allocation is
// 64 MiB. The host stages a source into the seed as UTF-32 code points, and the seed used
// to collect them into ONE `i32[]` — which `.push`'s 2x growth takes to 2^24 slots (64
// MiB) as soon as the source passes 2^23 code points. `strutil.CpAcc` now holds the stream
// as strings of `CHUNK` code points and joins them once, so what this suite has to prove is
// that the join is FAITHFUL, not only that it no longer traps:
//
//   * AT A BOUNDARY: a string literal spans the first chunk boundary with an astral code
//     point on each side of the split (U+1F600 as the last code point of chunk 0 and the
//     first of chunk 1), and the program prints its byte and code-point lengths. A code
//     point re-encoded, dropped or doubled at the split changes one of the two.
//   * ACROSS THE WHOLE STREAM: the pad is ~86,000 distinct numbered comment lines, and the
//     program ends in a deliberate type error whose reported LINE is asserted. A chunk
//     lost or duplicated anywhere (each holds ~10,000 lines) moves that line number.
//
// Each channel is graded: `srcLoad` (a single file, `vl run` and `vl build`), `modSrcLoad`
// (an imported module) and `cliResultLoad` (`vl check`, which runs under a collecting
// collector and so never trapped — it is here for the join). Against the pre-fix seed the
// three null-collector cases exit 70 with `allocation size too large`.
//
// The trap and the join both depend on the source's LENGTH, not its content, which is why
// the pad is comments: ~0.5 s and ~150 MB a case, where plumb's 11.6 MB program is ~20 s
// and ~3 GB.
//
// GATING: env-gated (`SELFHOST_NATIVE_ALIGN=1`) + needs the built binary + seed.
//
// @test-timing native

import { COMPILER, VL, exists, nativeEnv } from "./support/tree.ts";

const GATED = Deno.env.get("SELFHOST_NATIVE_ALIGN") === "1";
const ENABLED = GATED && exists(VL) && exists(COMPILER);
if (GATED && !ENABLED) {
  console.warn("[vl-large-source] skipped — missing vl binary or seed wasm.");
}

// Mirrors `CP_CHUNK` in `compiler/strutil.vl`. Duplicated on purpose: reading it from the
// source would put the literal on whatever boundary the compiler happens to use, which is
// not a test of that boundary.
const CHUNK = 1_048_576;

// Every pad line is exactly this many code points, newline included, and distinct.
const LINE_CPS = 100;
const padLine = (n: number): string => {
  const head = `// pad line ${String(n).padStart(7, "0")} `;
  return head + "x".repeat(LINE_CPS - 1 - head.length) + "\n";
};

// Lines before the literal, and the literal's opening, chosen so its first U+1F600 is code
// point CHUNK - 1: 10,485 lines is 1,048,500 code points, `const s = "` is 11, then 64 `a`.
const LINES_BEFORE = 10_485;
const OPEN = `const s = "`;
const A = "a".repeat(64);
const B = "b".repeat(64);
const ASTRAL = "\u{1F600}";
// Past 2^23 = 8,388,608 code points in total, the old list's next growth to 2^24 slots.
const LINES_AFTER = 76_000;

// `s` holds 64 + 2 + 64 code points and 64 + 8 + 64 UTF-8 bytes.
const WANT_OUT = "136\n130";

/** The big program body, as a list of lines' text, plus the 1-based line of its tail. */
const bigSource = (tail: string[]): { src: string; tailLine: number } => {
  const parts: string[] = [];
  for (let n = 1; n <= LINES_BEFORE; n++) parts.push(padLine(n));
  parts.push(OPEN + A + ASTRAL + ASTRAL + B + `"\n`);
  for (let n = LINES_BEFORE + 2; n <= LINES_BEFORE + 1 + LINES_AFTER; n++) parts.push(padLine(n));
  const tailLine = LINES_BEFORE + LINES_AFTER + 2;
  const src = parts.join("") + tail.join("\n") + "\n";
  // The boundary claim the whole suite rests on, checked on the text itself.
  const cps = Array.from(src);
  if (cps[CHUNK - 1] !== ASTRAL || cps[CHUNK] !== ASTRAL || cps.length <= 1 << 23) {
    throw new Error("fixture drifted: the astral pair no longer straddles the first chunk boundary");
  }
  return { src, tailLine };
};

// The line the type error sits on is `tailLine + ERR_OFFSET`, column 18 (the literal).
const RUN_TAIL = ["print(s.length)", "print(s.cpLen())"];
const ERR_TAIL = [...RUN_TAIL, `const bad: i32 = "no"`];
const ERR_OFFSET = 2;

type Res = { code: number; out: string; err: string };

const vl = async (args: string[]): Promise<Res> => {
  const { code, stdout, stderr } = await new Deno.Command(VL, {
    args: [...args, "--compiler", COMPILER],
    stdout: "piped",
    stderr: "piped",
    env: nativeEnv({ NO_COLOR: "1" }),
  }).output();
  return {
    code,
    out: new TextDecoder().decode(stdout),
    err: new TextDecoder().decode(stderr),
  };
};

const withDir = async (fn: (dir: string) => Promise<void>): Promise<void> => {
  const dir = await Deno.makeTempDir({ prefix: "vl_large_source_" });
  try {
    await fn(dir);
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
};

const show = (r: Res): string =>
  `rc ${r.code}\nstdout: ${r.out.slice(0, 400)}\nstderr: ${r.err.slice(0, 2000)}`;

const expectRuns = (what: string, r: Res) => {
  if (r.code !== 0 || r.out.trim() !== WANT_OUT) {
    throw new Error(`${what}: want rc 0 printing ${JSON.stringify(WANT_OUT)}, got ${show(r)}`);
  }
};

/** A type error reported at `path:line:18` — and only there. */
const expectErrorAt = (what: string, r: Res, path: string, line: number) => {
  const text = r.out + r.err;
  const at = `${path}:${line}:18`;
  if (r.code !== 1 || !text.includes(at) || !text.includes("cannot assign string to 'bad'")) {
    throw new Error(`${what}: want rc 1 with the type error at ${at}, got ${show(r)}`);
  }
};

Deno.test({
  name: "vl-large-source: a 9M-code-point single file runs, the boundary literal intact (`srcLoad`)",
  ignore: !ENABLED,
  fn: async () => {
    await withDir(async (dir) => {
      const prog = `${dir}/big.vl`;
      await Deno.writeTextFile(prog, bigSource(RUN_TAIL).src);
      expectRuns("vl run big.vl", await vl(["run", prog]));
    });
  },
});

Deno.test({
  name: "vl-large-source: a 9M-code-point single file reports its type error on the right line (`srcLoad`)",
  ignore: !ENABLED,
  fn: async () => {
    await withDir(async (dir) => {
      const prog = `${dir}/big.vl`;
      const { src, tailLine } = bigSource(ERR_TAIL);
      await Deno.writeTextFile(prog, src);
      const r = await vl(["build", prog, "-o", `${dir}/big.wasm`]);
      expectErrorAt("vl build big.vl", r, prog, tailLine + ERR_OFFSET);
    });
  },
});

Deno.test({
  name: "vl-large-source: a 9M-code-point imported module reports its type error on the right line (`modSrcLoad`)",
  ignore: !ENABLED,
  fn: async () => {
    await withDir(async (dir) => {
      const dep = `${dir}/dep.vl`;
      const { src, tailLine } = bigSource(["export const t = s", ...ERR_TAIL.slice(RUN_TAIL.length)]);
      await Deno.writeTextFile(dep, src);
      const prog = `${dir}/main.vl`;
      await Deno.writeTextFile(prog, `import { t } from "./dep"\nprint(t.length)\n`);
      const r = await vl(["run", prog]);
      expectErrorAt("vl run main.vl", r, dep, tailLine + 1);
    });
  },
});

Deno.test({
  name: "vl-large-source: `vl check` reads a 9M-code-point file whole (`cliResultLoad`)",
  ignore: !ENABLED,
  fn: async () => {
    await withDir(async (dir) => {
      const prog = `${dir}/big.vl`;
      const { src, tailLine } = bigSource(ERR_TAIL);
      await Deno.writeTextFile(prog, src);
      const r = await vl(["check", prog]);
      expectErrorAt("vl check big.vl", r, prog, tailLine + ERR_OFFSET);
    });
  },
});
