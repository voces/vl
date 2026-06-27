#!/usr/bin/env -S deno run -A
// Differential / generative fuzz tester for the NON-i32 representation layer.
//
// WHY: the compiler self-compiles to a byte-exact fixpoint, but the compiler is i32-only — it never
// exercises floats, i64, strings, structs, unions, nullables, closures, or lists. So the fixpoint
// gate is BLIND to the rep machinery; the corpus is the only net and it has gaps (this session found
// several by hand). This tool closes that blind spot.
//
// ORACLE: the TS host is deleted, so there is no second compiler to diff against. Instead the
// generator is GENERATIVE — it builds a random program AND computes the program's expected output
// itself (with explicit wasm integer semantics: Math.imul / `|0` for i32, BigInt.asIntN(64) for i64),
// then compiles+runs the program through the seed and asserts output === expected. A mismatch, a
// compile failure (rc != 0), or a runtime trap is a finding — each reported with the exact program
// and the --seed that reproduces it.
//
// USAGE:
//   deno run -A scripts/fuzz.ts [--seed N] [--iters M] [--verbose] [--only <gen>]
//   deno task fuzz                      # default 2000 iters, random seed
//   deno run -A scripts/fuzz.ts --seed 12345 --iters 1   # reproduce a single finding
//
// The seed build must be fresh: `bash scripts/refresh-compiler.sh` first.

import { runWasm, VLRuntimeError } from "../tests/support/runWasm.ts";

const SEED_PATH = new URL("../build/vl-compiler.wasm", import.meta.url);

// ── seed driver plumbing (mirrors tests/cases_wasm_test.ts) ────────────────────
type Exports = Record<string, (...a: number[]) => number>;

export const seedExists = (() => {
  try {
    Deno.statSync(SEED_PATH);
    return true;
  } catch {
    return false;
  }
})();

let _exp: Exports | undefined;
const exp = (): Exports => {
  if (!_exp) {
    const bytes = Deno.readFileSync(SEED_PATH);
    const mod = new WebAssembly.Module(bytes);
    _exp = new WebAssembly.Instance(mod, {}).exports as unknown as Exports;
  }
  return _exp;
};

const pushString = (push: (cp: number) => number, text: string) => {
  for (const ch of text) push(ch.codePointAt(0)!);
};
const readString = (len: number, at: (j: number) => number): string => {
  const cps = new Array<number>(len);
  for (let j = 0; j < len; j++) cps[j] = at(j);
  return String.fromCodePoint(...cps);
};
const readDiags = (): string[] => {
  const n = exp().diagCount();
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    out.push(
      `${exp().diagLine(i)}:${exp().diagCol(i)} ${
        readString(exp().diagMsgLen(i), (j) => exp().diagMsgAt(i, j))
      }`,
    );
  }
  return out;
};

type Compiled = { rc: number; diags: string[]; bytes?: Uint8Array };
const compile = (src: string): Compiled => {
  exp().modReset();
  exp().srcReset();
  pushString(exp().srcPush, src);
  const rc = exp().compileSrc();
  const diags = rc === 0 ? [] : readDiags();
  let bytes: Uint8Array | undefined;
  if (rc === 0) {
    const n = exp().rbyteLen();
    bytes = new Uint8Array(n);
    for (let i = 0; i < n; i++) bytes[i] = exp().rbyteAt(i);
  } else if (rc === 3) {
    // Flush the emit-failure store (shared instance) so it doesn't leak into the next case.
    exp().modReset();
    exp().srcReset();
    pushString(exp().srcPush, "print(1)\n");
    exp().compileSrc();
  }
  return { rc, diags, bytes };
};

// ── seeded PRNG ────────────────────────────────────────────────────────────────
const mulberry32 = (a: number) => () => {
  a |= 0;
  a = (a + 0x6d2b79f5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
type Rng = () => number;
const rint = (r: Rng, lo: number, hi: number) =>
  lo + Math.floor(r() * (hi - lo + 1));
const pick = <T>(r: Rng, xs: T[]): T => xs[rint(r, 0, xs.length - 1)];

// ── scalar expression trees (render to VL + evaluate with wasm semantics) ───────
type Scalar = {
  src: string;
  kind: "i32" | "i64" | "f64" | "string";
  show: string;
};

const i32 = (v: number): Scalar => {
  const w = v | 0;
  return { src: w < 0 ? `(0 - ${-w})` : `${w}`, kind: "i32", show: `${w}` };
};
const i64 = (v: bigint): Scalar => {
  const w = BigInt.asIntN(64, v);
  // VL i64 literals are bare integers; a large literal infers i64 only with an i64 context, so
  // every i64 program annotates its binding `: i64`. Negative renders via subtraction.
  return { src: w < 0n ? `(0 - ${-w})` : `${w}`, kind: "i64", show: `${w}` };
};
const f64 = (v: number): Scalar => {
  // Integer-valued only, so VL's f64 print (drops a trailing `.0`) === String(int).
  const w = Math.trunc(v);
  const lit = `${Math.abs(w)}.0`;
  return { src: w < 0 ? `(0.0 - ${lit})` : lit, kind: "f64", show: `${w}` };
};

const genI32 = (r: Rng, depth: number): Scalar => {
  if (depth <= 0 || r() < 0.4) return i32(rint(r, -50, 50));
  const a = genI32(r, depth - 1), b = genI32(r, depth - 1);
  const op = pick(r, ["+", "-", "*"]);
  const va = parseInt(a.show), vb = parseInt(b.show);
  const v = op === "+" ? va + vb : op === "-" ? va - vb : Math.imul(va, vb);
  return { src: `(${a.src} ${op} ${b.src})`, kind: "i32", show: `${v | 0}` };
};
const genI64 = (r: Rng, depth: number): Scalar => {
  if (depth <= 0 || r() < 0.4) {
    // ALWAYS magnitude > 2^32, so VL infers i64 (not i32) for the literal and the arithmetic stays
    // i64 — otherwise an i32-fitting literal makes VL wrap at 32 bits and the oracle (which assumes
    // i64 throughout) diverges. Large products overflow i64; both sides wrap, which is the point.
    const mag = BigInt(rint(r, 0, 1 << 20)) * 8_589_934_592n +
      BigInt(rint(r, 0, 1_000_000));
    return i64(r() < 0.5 ? mag : -mag);
  }
  const a = genI64(r, depth - 1), b = genI64(r, depth - 1);
  const op = pick(r, ["+", "-", "*"]);
  const va = BigInt(a.show), vb = BigInt(b.show);
  const v = op === "+" ? va + vb : op === "-" ? va - vb : va * vb;
  return {
    src: `(${a.src} ${op} ${b.src})`,
    kind: "i64",
    show: `${BigInt.asIntN(64, v)}`,
  };
};
const genF64 = (r: Rng, depth: number): Scalar => {
  if (depth <= 0 || r() < 0.4) return f64(rint(r, -50, 50));
  const a = genF64(r, depth - 1), b = genF64(r, depth - 1);
  const op = pick(r, ["+", "-", "*"]);
  const va = parseInt(a.show), vb = parseInt(b.show);
  const v = op === "+" ? va + vb : op === "-" ? va - vb : va * vb;
  return { src: `(${a.src} ${op} ${b.src})`, kind: "f64", show: `${v}` };
};
const STR_ATOMS = ["a", "bc", "", "Z9", "hi", "xyz"];
const genStr = (r: Rng, depth: number): Scalar => {
  if (depth <= 0 || r() < 0.5) {
    const s = pick(r, STR_ATOMS);
    return { src: JSON.stringify(s), kind: "string", show: s };
  }
  const a = genStr(r, depth - 1), b = genStr(r, depth - 1);
  return {
    src: `(${a.src} + ${b.src})`,
    kind: "string",
    show: a.show + b.show,
  };
};

const genScalar = (r: Rng, kind: Scalar["kind"], depth: number): Scalar =>
  kind === "i32"
    ? genI32(r, depth)
    : kind === "i64"
    ? genI64(r, depth)
    : kind === "f64"
    ? genF64(r, depth)
    : genStr(r, depth);

const KINDS: Scalar["kind"][] = ["i32", "i64", "f64", "string"];
const ann = (k: Scalar["kind"]) => k; // VL annotation name == kind name

// ── rep program generators: each returns a full VL program + expected stdout ────
type Prog = { name: string; src: string; expected: string };
const wrap = (body: string) => `function go() {\n${body}\n}\ngo()\n`;

// 1. Pure scalar arithmetic over each rep.
const pScalar = (r: Rng): Prog => {
  const k = pick(r, KINDS);
  const e = genScalar(r, k, 3);
  // Bind through an annotated local so the expression's rep is pinned (esp. i64 vs i32 widening).
  return {
    name: `scalar:${k}`,
    src: wrap(`const r: ${ann(k)} = ${e.src}\nprint(r)`),
    expected: e.show,
  };
};

// 2. Struct with a field of a random kind — construct, read the field back.
const pStructField = (r: Rng): Prog => {
  const n = rint(r, 1, 4);
  const fields: { k: Scalar["kind"]; e: Scalar }[] = [];
  for (let i = 0; i < n; i++) {
    const k = pick(r, KINDS);
    fields.push({ k, e: genScalar(r, k, 2) });
  }
  const ty = "{" + fields.map((f, i) => `f${i}: ${ann(f.k)}`).join(", ") + "}";
  const lit = "{" + fields.map((f, i) => `f${i}: ${f.e.src}`).join(", ") + "}";
  const read = rint(r, 0, n - 1);
  return {
    name: "structField",
    src: wrap(`const s: ${ty} = ${lit}\nprint(s.f${read})`),
    expected: fields[read].e.show,
  };
};

// 3. A list of a random kind — construct, index-read.
const pListIndex = (r: Rng): Prog => {
  const k = pick(r, KINDS);
  const n = rint(r, 1, 5);
  const es: Scalar[] = [];
  for (let i = 0; i < n; i++) es.push(genScalar(r, k, 2));
  const read = rint(r, 0, n - 1);
  return {
    name: `listIndex:${k}`,
    src: wrap(
      `const xs: ${ann(k)}[] = [${
        es.map((e) => e.src).join(", ")
      }]\nprint(xs[${read}])`,
    ),
    expected: es[read].show,
  };
};

// 4. An i32 list summed via for-in (exercises list iteration).
const pListSum = (r: Rng): Prog => {
  const n = rint(r, 1, 6);
  const es: Scalar[] = [];
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const e = genI32(r, 1);
    es.push(e);
    sum = (sum + parseInt(e.show)) | 0;
  }
  return {
    name: "listSum",
    src: wrap(
      `const xs: i32[] = [${es.map((e) => e.src).join(", ")}]\n` +
        `let acc = 0\nfor v in xs { acc = acc + v }\nprint(acc)`,
    ),
    expected: `${sum}`,
  };
};

// 5. A closure capturing a value, called (i32/i64/f64).
const pClosure = (r: Rng): Prog => {
  const k = pick(r, ["i32", "i64", "f64"] as Scalar["kind"][]);
  const cap = genScalar(r, k, 1);
  const arg = genScalar(r, k, 1);
  // result = arg + cap, with wasm semantics for the show value
  let show: string;
  if (k === "i64") {
    show = `${BigInt.asIntN(64, BigInt(arg.show) + BigInt(cap.show))}`;
  } else if (k === "i32") {
    show = `${(parseInt(arg.show) + parseInt(cap.show)) | 0}`;
  } else show = `${parseInt(arg.show) + parseInt(cap.show)}`;
  return {
    name: `closure:${k}`,
    src: wrap(
      `const c: ${ann(k)} = ${cap.src}\n` +
        `const f: (${ann(k)}) => ${ann(k)} = (x) => x + c\n` +
        `print(f(${arg.src}))`,
    ),
    expected: show,
  };
};

// 6. A union of two struct variants — construct one, narrow with `is`, read a field.
const pUnion = (r: Rng): Prog => {
  const va = rint(r, -40, 40), vb = rint(r, -40, 40);
  const pickC = r() < 0.5;
  const body = pickC
    ? `const u: C | D = { c: ${va} }\nif u is C { print(u.c) } else { print(-1) }`
    : `const u: C | D = { d: ${vb} }\nif u is D { print(u.d) } else { print(-1) }`;
  return {
    name: "union",
    src: `type C = { c: i32 }\ntype D = { d: i32 }\n` + wrap(body),
    expected: `${pickC ? va : vb}`,
  };
};

// 7. A nullable — non-null construct, narrowed read (`??` for value, `!= null` for struct).
const pNullable = (r: Rng): Prog => {
  if (r() < 0.5) {
    const v = genI32(r, 1);
    const d = rint(r, -9, 9);
    return {
      name: "nullable:i32",
      src: wrap(`const r: i32 | null = ${v.src}\nprint(r ?? ${d})`),
      expected: v.show,
    };
  }
  const v = rint(r, -40, 40);
  return {
    name: "nullable:struct",
    src: `type P = { x: i32 }\n` +
      wrap(
        `const r: P | null = { x: ${v} }\nif r != null { print(r.x) } else { print(-1) }`,
      ),
    expected: `${v}`,
  };
};

// 8. A nested struct (struct field whose type is another struct) — round-trip a leaf.
const pNestedStruct = (r: Rng): Prog => {
  const v = rint(r, -40, 40);
  return {
    name: "nestedStruct",
    src: `type Inner = { v: i32 }\ntype Outer = { inner: Inner, tag: i32 }\n` +
      wrap(
        `const o: Outer = { inner: { v: ${v} }, tag: 7 }\nprint(o.inner.v + o.tag)`,
      ),
    expected: `${(v + 7) | 0}`,
  };
};

// 9. .map over a list with a literal lambda (exercises the inline map loop + result rep).
const pMap = (r: Rng): Prog => {
  const n = rint(r, 1, 5);
  const es: Scalar[] = [];
  for (let i = 0; i < n; i++) es.push(genI32(r, 1));
  const k = rint(r, 1, 5);
  const read = rint(r, 0, n - 1);
  const v = Math.imul(parseInt(es[read].show), k) | 0;
  return {
    name: "mapLambda",
    src: wrap(
      `const xs: i32[] = [${es.map((e) => e.src).join(", ")}]\n` +
        `const ys = xs.map((n) => n * ${k})\nprint(ys[${read}])`,
    ),
    expected: `${v}`,
  };
};

const GENERATORS: Record<string, (r: Rng) => Prog> = {
  scalar: pScalar,
  structField: pStructField,
  listIndex: pListIndex,
  listSum: pListSum,
  closure: pClosure,
  union: pUnion,
  nullable: pNullable,
  nestedStruct: pNestedStruct,
  map: pMap,
};

// ── run one program through the seed; classify the outcome ──────────────────────
type Outcome =
  | { ok: true }
  | { ok: false; why: string; actual: string };

const runProg = async (p: Prog): Promise<Outcome> => {
  const c = compile(p.src);
  if (c.rc !== 0) {
    const tier = ["ok", "parse", "type", "emit"][c.rc] ?? `${c.rc}`;
    return {
      ok: false,
      why: `COMPILE-${tier}: ${c.diags.join(" | ")}`,
      actual: "",
    };
  }
  try {
    const { logs } = await runWasm(c.bytes!);
    const actual = logs.join("\n");
    if (actual !== p.expected) {
      return { ok: false, why: "OUTPUT-MISMATCH", actual };
    }
    return { ok: true };
  } catch (e) {
    const msg = e instanceof VLRuntimeError ? e.message : `${e}`;
    return { ok: false, why: `RUNTIME-TRAP: ${msg}`, actual: "" };
  }
};

// ── calibration: validate the oracle's formatting assumptions before fuzzing ────
const CALIBRATION: Prog[] = [
  { name: "c-i32", src: "print(5)\n", expected: "5" },
  {
    name: "c-i64",
    src: "function go(){const x:i64=5000000000\nprint(x)}\ngo()\n",
    expected: "5000000000",
  },
  {
    name: "c-f64",
    src: "function go(){print(2.0 + 3.0)}\ngo()\n",
    expected: "5",
  },
  {
    name: "c-f64neg",
    src: "function go(){print(0.0 - 4.0)}\ngo()\n",
    expected: "-4",
  },
  {
    name: "c-str",
    src: 'function go(){print("a" + "bc")}\ngo()\n',
    expected: "abc",
  },
  {
    name: "c-i32neg",
    src: "function go(){print(0 - 7)}\ngo()\n",
    expected: "-7",
  },
];

// ── entry points (importable by tests) ─────────────────────────────────────────
const fmtReport = (
  p: Prog,
  o: Extract<Outcome, { ok: false }>,
  seed: number,
): string => {
  const lines = [
    `✗ [${p.name}] ${o.why}`,
    `  reproduce: deno run -A scripts/fuzz.ts --seed ${seed} --iters 1`,
    "  ── program ──",
    p.src.split("\n").map((l) => "  " + l).join("\n"),
  ];
  if (o.why === "OUTPUT-MISMATCH") {
    lines.push(`  expected: ${JSON.stringify(p.expected)}`);
    lines.push(`  actual:   ${JSON.stringify(o.actual)}`);
  }
  return lines.join("\n");
};

/** Validate the oracle's print-formatting assumptions. Returns an error report, or null if ok. */
export const calibrate = async (): Promise<string | null> => {
  for (const p of CALIBRATION) {
    const o = await runProg(p);
    if (!o.ok) return `CALIBRATION FAILED (${p.name}):\n${fmtReport(p, o, 0)}`;
  }
  return null;
};

export type FuzzResult = { iters: number; findings: number; reports: string[] };

/** Run `iters` generated programs from `baseSeed`; collect findings (deduped by class). */
export const fuzz = async (
  opts: { seed: number; iters: number; only?: string | null; all?: boolean },
): Promise<FuzzResult> => {
  const genNames = opts.only ? [opts.only] : Object.keys(GENERATORS);
  const reports: string[] = [];
  const seen = new Set<string>();
  let findings = 0;
  for (let i = 0; i < opts.iters; i++) {
    const seed = (opts.seed + i) | 0;
    const r = mulberry32(seed);
    const p = GENERATORS[pick(r, genNames)](r);
    const o = await runProg(p);
    if (!o.ok) {
      findings++;
      const why = (o as { why: string }).why;
      const key = `${p.name}|${why.split(":")[0]}`;
      if (opts.all || !seen.has(key)) {
        seen.add(key);
        reports.push(fmtReport(p, o as Extract<Outcome, { ok: false }>, seed));
      }
    }
  }
  return { iters: opts.iters, findings, reports };
};

// ── CLI ─────────────────────────────────────────────────────────────────────────
if (import.meta.main) {
  const args = Deno.args;
  const flag = (n: string, d: number): number => {
    const i = args.indexOf(n);
    return i >= 0 && args[i + 1] ? Number(args[i + 1]) : d;
  };
  const onlyArg = (() => {
    const i = args.indexOf("--only");
    return i >= 0 ? args[i + 1] : null;
  })();
  const baseSeed = flag("--seed", (Math.random() * 2 ** 31) | 0);
  const iters = flag("--iters", 2000);

  console.log("calibrating oracle…");
  const calErr = await calibrate();
  if (calErr) {
    console.error(calErr);
    Deno.exit(2);
  }
  console.log("calibration ok.\n");
  console.log(`fuzzing: ${iters} iters, base seed ${baseSeed}`);
  const { findings, reports } = await fuzz({
    seed: baseSeed,
    iters,
    only: onlyArg,
    all: args.includes("--verbose"),
  });
  for (const rep of reports) console.error("\n" + rep);
  console.log(`\ndone. ${iters} programs, ${findings} findings.`);
  Deno.exit(findings > 0 ? 1 : 0);
}
