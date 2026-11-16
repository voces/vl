// Keeps the independent oracle (scripts/oracle/) alive: it runs every `vl` example in
// docs/spec/*.md that says what it prints and nothing it refuses, and compares. A spec edit the
// oracle has not learned, or an oracle edit that breaks the spec, fails here. The examples it
// cannot run yet are listed in SPEC_SKIPS by their first line, so the count can only grow.

import { distilledExpectations, interpret, judge, judgeRecording, knownEmulations, knownRefusals } from "../scripts/oracle/oracle.ts";
import { grid } from "../scripts/oracle/join-grid.ts";
import { grid as rulingGrid } from "../scripts/oracle/ruling-grid.ts";

type Example = { where: string; src: string; want: string[] };

// `// prints X` per line; `// prints a, b (one per line)` is several lines.
function examples(): Example[] {
  const out: Example[] = [];
  for (const f of [...Deno.readDirSync("docs/spec")].map((e) => e.name).filter((n) => n.endsWith(".md")).sort()) {
    const text = Deno.readTextFileSync(`docs/spec/${f}`);
    let n = 0;
    for (const m of text.matchAll(/```vl\n([\s\S]*?)```/g)) {
      n++;
      const src = m[1];
      if (/refused|\btraps\b|warns|hint|parse error|@|import /.test(src)) continue;
      const want: string[] = [];
      for (const l of src.split("\n")) {
        const p = /\/\/ prints (.*)$/.exec(l);
        if (!p) continue;
        const v = p[1].trim();
        const many = /^(.*) \(one per line\)$/.exec(v);
        if (many) want.push(...many[1].split(/, (?:then )?/));
        else want.push(v.replace(/^(.*?), then (.*)$/, "$1\n$2"));
      }
      if (want.length) out.push({ where: `${f}: ${src.split("\n").slice(0, 2).join(" / ")}`, src, want: want.join("\n").split("\n") });
    }
  }
  return out;
}

// Examples outside the oracle's subset today, by file and first two lines. Shrink it; never grow it to
// hide a regression.
const SPEC_SKIPS = new Set<string>(JSON.parse(Deno.readTextFileSync("scripts/oracle/spec-skips.json")));

Deno.test("oracle: every spec example it runs prints what the spec says", () => {
  const bad: string[] = [];
  let ran = 0;
  for (const ex of examples()) {
    const o = interpret(ex.src);
    // `// prints a, b` on one comment is either one line or two: the spec writes both.
    const ok = o.kind === "ok" && (o.out.join("\n") === ex.want.join("\n") || o.out.join(", ") === ex.want.join(", "));
    if (SPEC_SKIPS.has(ex.where)) {
      if (ok) bad.push(`${ex.where}: now runs; remove it from scripts/oracle/spec-skips.json`);
      continue;
    }
    ran++;
    if (!ok) bad.push(`${ex.where}: want ${JSON.stringify(ex.want)}, got ${o.kind} ${JSON.stringify(o.out)} ${o.msg}`);
  }
  if (bad.length) throw new Error(`${bad.length} of ${ran} spec examples disagree:\n` + bad.join("\n"));
  if (ran < 60) throw new Error(`want at least 60 spec examples run, got ${ran}`);
});

Deno.test("oracle: verdicts", () => {
  const ok = { kind: "ok" as const, out: ["7"], msg: "" };
  const cases: [string, string][] = [
    [judge(ok, { cls: "runs", out: ["7"] }, null).v, "AGREE"],
    [judge(ok, { cls: "runs", out: ["0"] }, null).v, "DISAGREE"],
    [judge({ kind: "fault", out: [], msg: "x" }, { cls: "runs", out: [] }, null).v, "UNSOUND"],
    [judge({ kind: "fault", out: [], msg: "x" }, { cls: "rejected", out: null }, null).v, "AGREE"],
    [judge(ok, { cls: "invalid", out: null }, null).v, "COMPILED-BAD"],
    [judge(ok, { cls: "rejected", out: null }, null).v, "REFUSED"],
    [judge({ kind: "trap", out: [], msg: "x" }, { cls: "rejected", out: null }, null).v, "REFUSED"],
    [judge({ kind: "unsupported", out: [], msg: "x" }, { cls: "runs", out: [] }, null).v, "SKIP"],
  ];
  for (const [got, want] of cases) if (got !== want) throw new Error(`verdict: want ${want}, got ${got}`);
});

// Programs the oracle once got wrong, with the stdout the compiler and the spec agree on.
Deno.test("oracle: pinned regressions", () => {
  const pins: [string, string][] = [
    ["print((-2147483648) - 0x7fffffff)", "1"], // a radix tree at i32: `-2147483648` is an i32 literal
    ["print(7 + 0xFFFFFFFF)", "6"],
    ["print(0x1_0000_0000)", "4294967296"],
    ["print(0.1 + 0.2)", "0.30000000000000004"], // E9.1: a float constant folds in IEEE
    ["print(1.5 % 0.1)", "0.09999999999999992"],
    ["print((1.5 % 0.1) / (2.5 % 0.1))", "1.0000000000000007"],
    // T2.3 (ruling 4.1, revised): a radix literal in a float context is its digits' value, rounded
    ["print(0xFFFFFFFF as f32)", "4294967296"],
    ["print(0x80000000 as f32)", "2147483648"],
    ["print(0xFFFFFFFF as f64)", "4294967295"],
    ["print(0xFFFFFFFFFFFFFFFF as f64)", "18446744073709552000"],
    ["print(0x1_0000_0001 as f32)", "4294967296"],
    ["print(1.5 + 0xFFFFFFFF)", "4294967296.5"],
    ["print(0xFFFFFFFF)", "-1"], // an integer context keeps the pattern
    // D3053 ruling (A): `as% i64` reads a radix literal, and a negation chain over one, at its value
    ["print(0xFFFFFFFF as% i64)", "4294967295"],
    ["print((-(-(-0xFFFFFFFF))) as% i64)", "-4294967295"],
    // D16494: a radix tree under `as% i64` is its exact value, as under `as i64`
    ["print((0xFFFFFFFF * 2) as% i64)", "8589934590"],
    ["print((0xFFFFFFFF + 1) as% i64)", "4294967296"],
    ["print((0xFFFFFFFF / 1) as% i64)", "4294967295"],
    ["print((~0xFFFFFFFF) as% i64)", "-4294967296"],
    // ... and `as% i32` / `as% u8` wrap that exact value
    ["print((0xFFFFFFFF / 2) as% i32)", "2147483647"],
    ["print((0xFFFFFFFF % 1000) as% i32)", "295"],
    ["print((0xFFFFFFFF / 256) as% u8)", "255"],
    ["print((0xFFFFFFFF * 2) as% i32)", "-2"],
    ["print(0xFFFFFFFF as% i32)", "-1"],
    // ruling 4.2: a radix tree read at an f64 computes at 64 bits with integer division
    ["const y: f64 = 0xFFFFFFFF / 2\nprint(y)", "2147483647"],
    ["const c: f64 = 0x7FFFFFFF << 2\nprint(c)", "8589934588"],
    ["print(2.0 * (0x80000000 >> 1))", "2147483648"],
    ["print((0xFFFFFFFF % 1_000) as i64)", "295"],
    ["print(0xFFFFFFFF / 2)", "0"], // no use: the 32-bit pattern
    // 4.3: a radix tree that is no constant, beside a typed i64 arm, runs at that arm's width
    ["let k: i32 = -5\nconst v2: i64 = 4294967296\nprint(if k > 0 { v2 } else { 0xFFFFFFFF << k })", "-576460752303423488"],
    // D3043: a radix tree holding a decimal outside i32 is i64 beside an i32 arm
    ["function f(p: i32): i64 { return if p == 0 { p - 9 } else { 0xFFFFFFFF - 9223372036854775807 } }\nprint(f(3))", "-9223372032559808512"],
    // 4.3: a float join beside an `f32` argument of `min` adopts f32
    ["function g(p: f32): f32 { return p }\nlet c: f64 = 1e-7\nconst m: f32 = min(g(2.5), 0.1 % (if 0.0 < c { 3.0 } else { 0.5 }))\nprint(m)", "0.10000000149011612"],
    // a shift's count never types its left operand; a constant count of 32 to 63 widens it (Q8)
    ["const c: i32 = 40\nconst v: i64 = 1 << c\nprint(v)", "1099511627776"],
    ["const c: i32 = 3\nconst v: i64 = (0xFFFFFFFF << 31) << c\nprint(v)", "-17179869184"],
    ["print(0x1 << 40)", "1099511627776"],
    // ruling 4.4: `is` on an empty container reads the type it was built at
    ["const e: Set<i32> = Set()\nconst u: Set<i32> | Set<string> = e\nprint(u is Set<string>)", "false"],
    ["type L = i32[] | f64[]\nconst xs: L[] = [[]]\nprint(xs[0] is f64[])", "false"],
    ["const m: {[string]: string | i32} = Map()\nconst w: {[string]: string | i32} | string = m\nprint(w is {[string]: i32 | string})", "true"],
    // ruling A: a radix tree computes at its use's width, which an i64 peer fixes after it ran
    ["print((0xFFFF0000 | 0xFF) + 3000000000)", "7294902015"],
    ["const t: i64 = 3000000000\nprint(min((0xFFFFFFFF / (-1)), t))", "-4294967295"],
    ["print(9 << (7 % 0xFFFFFFFF))", "9"], // a shift count keeps its own reading (Q8)
    ["const c: boolean = false\nprint(if c { 4294967296 } else { 0xFFFFFFFF })", "4294967295"],
    ["const t: i64 = 5\nconst s: i32 = 4\nprint(min(t, 0xFFFFFFFF << s))", "5"],
    // 4.3 with Q9: a float constant arm that adopts an f32 arm folds in f32 arithmetic
    ["const f: f32 = 0.1\nconst c: boolean = false\nprint(if c { f } else { 16777217.0 % 1.5 })", "1"],
    // Q8: a constant count of 32 to 63 makes the radix left i64, beside an i32 peer too
    ["const v8: i32 = 5\nprint((-v8) * (0xFFFFFFFF >>> 51))", "0"],
    // D3043: a constant that does not fit its `i32` peer is i64, and the peer widens
    ["const a: i32 = 1\nprint(a + 0x1FFFFFFFF)", "8589934592"],
    ["const a: i32 = 1\nprint(a - (0x1FFFFFFFF & 0xF))", "-14"],
    // a store delivers to the element type a declared container was built at
    ["const m: {[string]: i64} = Map()\nm[\"a\"] = 0xFFFFFFFF\nprint(m[\"a\"] ?? 0)", "4294967295"],
    ["const m: {[string]: f32} = Map()\nm[\"a\"] = 0.1\nprint(m[\"a\"] ?? 0)", "0.10000000149011612"],
    // Q8: a constant count of 32 to 63 makes a constant left i64, `~` and joins included
    ["print((~9) >>> 34)", "1073741823"],
    ["let c = true\nprint((if c { 0xFFFFFFFF } else { 0xFFFFFFFF }) >>> 57)", "0"],
    ["let v1: i32 = 3\nprint((0xFFFFFFFF << v1) >> 56)", "0"],
    ["let v4: i32 = 1\nprint((0x7fffffff << v4) as i64)", "4294967294"],
    // D16492: a pattern beside an i64 constant tree is zero-extended, through `~` and min/max
    ["print(((0xFFFFFFFF & 0) | (~4294967296)) <= -2)", "true"],
    ["print(max(0 * (0xFFFFFFFF - 3000000000), 100 - 0xFFFFFFFF))", "0"],
    ["let v: i32 = 65535\nprint(3000000000 - (0xFFFFFFFF >>> v))", "3000000000"],
    // a negative constant's `>>>` is typed at its use
    ["print(max((-1) >>> 9, min(9, 3000000000)))", "36028797018963967"],
    // 4.3: an integer arm beside a wide decimal arm is i64; a join tree is typed by its arms
    ["let c = false\nprint((if c { -9000000003 } else { -1 }) + 0xFFFFFFFF)", "4294967294"],
    ["let c = true\nprint((if c { 2147483647 } else { 1 }) * 2)", "-2"],
    ["let c = false\nprint(((if c { 65535 } else { 0xFFFFFFFF }) * 7) + (0xFFFFFFFF + 4294967296))", "38654705656"],
    // 4.3: the join decides a radix tree arm's context before its destination (fuzz cell ar_s11_0099)
    ["let v2: i32 = 46341\nlet v3: i64 = (if (v2 == v2) { (3 + (0xFFFFFFFF << 26)) } else { max(0, 1) })\nprint(v3)", "-67108861"],
    ["let v2: i32 = 46341\nlet v3: i64 = (if (v2 == v2) { (0xFFFFFFFF << 26) } else { v2 })\nprint(v3)", "-67108864"],
    // Q9: a float constant beside an f32 folds at f32, in a comparison and as a join's arm
    ["const f: f32 = 0.1\nprint((16777217.0 - 1.5) < max(f, 16777217.0))", "true"],
    ["const a: f32 = 1.0\nlet c = true\nprint(a / (if c { (0.1 * 0.1) } else { 0.5 }))", "99.99999237060547"],
    // 4.1 / D1890: `as f32` rounds an integer constant once
    ["print(9000000003 as f32)", "9000000512"],
    // E8.3: a constant cast to `u8` is checked against 0..255; a radix one at its 32-bit pattern
    ["let v = 300\nprint(v as? u8)", "null"],
    ["let c = true\nc = !c\nprint((if c { 1 } else { 0x1FF }) as? u8)", "null"], // a join is no constant
    ["print(0xFF as? u8)", "255"],
    ["const c: boolean = false\nprint((if c { 1 } else { 0xFF }) as u8)", "255"],
  ];
  for (const [src, want] of pins) {
    const o = interpret(src + "\n");
    if (o.kind !== "ok" || o.out.join("\n") !== want) throw new Error(`${src}: want ${want}, got ${o.kind} ${JSON.stringify(o.out)} ${o.msg}`);
  }
  // T1.3: a storage width is no cast target; E8.2: a failed bare `as` at top level has no function to return null
  // E8.2: a constant cast that can never succeed; E8.4: `as%` to a float
  // E6.2 and D2.3: a constant shift count out of range, and a constant zero divisor
  for (const src of ["print(7 as? u16)", "print(300 as u8)", "print(300 as? u8)", "print(3.9 as? i32)", "print(3 as% f64)", "print(9 << 64)", "print(9 << (-1))", "const x: i32 = 5\nprint(x << 40)", "print(7 / (3 - 3))", "print(0xFF / 0)"]) {
    const o = interpret(src + "\n");
    if (o.kind !== "fault") throw new Error(`${src}: want fault, got ${o.kind} ${JSON.stringify(o.out)}`);
  }
});

// Spec T3.6 (ruling 4.3): the oracle gives every cell of the join grid the type the rule gives.
Deno.test("oracle: the T3.6 join grid", () => {
  for (const c of grid()) {
    const o = interpret(c.src);
    if (o.kind !== "ok" || o.out.join("\n") !== c.want) throw new Error(`${c.name}: want ${c.want}, got ${o.kind} ${JSON.stringify(o.out)} ${o.msg}`);
  }
});

// D16410 and D16293 (a): the oracle gives every case of the ruling grid what the ruling gives, and
// a check refusal (`refused`) is the oracle's type fault.
Deno.test("oracle: the D16410 and D16293 (a) ruling grid", () => {
  for (const c of rulingGrid()) {
    const o = interpret(c.src);
    const got = o.kind === "fault" ? "refused" : o.kind === "ok" ? o.out.join("\n") : `${o.kind} ${o.msg}`;
    if (got !== c.want) throw new Error(`${c.name}: want ${JSON.stringify(c.want)}, got ${JSON.stringify(got)}`);
  }
});

// A distilled cell the corpus already grades `runs but wrong value` is COMPILED-BAD in a sweep
// recording, never a new disagreement: the oracle prints the manifest's expectation.
Deno.test("oracle: a known wrong-value cell in a recording is not a disagreement", async () => {
  const cell = "scripts/silent-sweep/distilled/named/dord022.vl";
  const dir = Deno.makeTempDirSync();
  try {
    const rec = `${dir}/rec.jsonl`;
    Deno.writeTextFileSync(rec, JSON.stringify({ cell, outcome: "runs", stdout: "0000000000000000" }) + "\n");
    const rows = await judgeRecording(rec, "", 0, Date.now(), distilledExpectations());
    const got = rows?.map((r) => r.verdict).join(",");
    if (got !== "COMPILED-BAD") throw new Error(`want COMPILED-BAD, got ${got}`);
  } finally {
    Deno.removeSync(dir, { recursive: true });
  }
});

Deno.test("oracle: a known.txt row line files a refusal; a cell line does not", () => {
  const got = JSON.stringify(knownRefusals(["ar_s1_0001", "D16412  monomorphize: unsupported argument type for `", "D1  x  y"]));
  const want = JSON.stringify([{ row: "D16412", fragment: "monomorphize: unsupported argument type for `" }, { row: "D1", fragment: "x  y" }]);
  if (got !== want) throw new Error(`want ${want}, got ${got}`);
});

// An emulation reproduces an OPEN row's compiled reading; the PR that closes the row deletes it.
Deno.test("oracle: every `(emulated)` known.txt row is open", () => {
  for (const row of knownEmulations()) {
    const head = Deno.readTextFileSync(new URL(`../docs/internals/inventory/${row}.md`, import.meta.url)).split("\n")[2] ?? "";
    if (/^\*\*closed\b/.test(head)) throw new Error(`${row} is closed: delete its emulation in interp.ts and its known.txt line`);
  }
});
