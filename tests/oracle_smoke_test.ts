// Keeps the independent oracle (scripts/oracle/) alive: it runs every `vl` example in
// docs/spec/*.md that says what it prints and nothing it refuses, and compares. A spec edit the
// oracle has not learned, or an oracle edit that breaks the spec, fails here. The examples it
// cannot run yet are listed in SPEC_SKIPS by their first line, so the count can only grow.

import { distilledExpectations, interpret, judge, judgeRecording } from "../scripts/oracle/oracle.ts";
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
    // ruling 4.2: a radix tree read at an f64 computes at 64 bits with integer division
    ["const y: f64 = 0xFFFFFFFF / 2\nprint(y)", "2147483647"],
    ["const c: f64 = 0x7FFFFFFF << 2\nprint(c)", "8589934588"],
    ["print(2.0 * (0x80000000 >> 1))", "2147483648"],
    ["print((0xFFFFFFFF % 1_000) as i64)", "295"],
    ["print(0xFFFFFFFF / 2)", "0"], // no use: the 32-bit pattern
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
  ];
  for (const [src, want] of pins) {
    const o = interpret(src + "\n");
    if (o.kind !== "ok" || o.out.join("\n") !== want) throw new Error(`${src}: want ${want}, got ${o.kind} ${JSON.stringify(o.out)} ${o.msg}`);
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
