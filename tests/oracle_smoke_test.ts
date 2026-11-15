// Keeps the independent oracle (scripts/oracle/) alive: it runs every `vl` example in
// docs/spec/*.md that says what it prints and nothing it refuses, and compares. A spec edit the
// oracle has not learned, or an oracle edit that breaks the spec, fails here. The examples it
// cannot run yet are listed in SPEC_SKIPS by their first line, so the count can only grow.

import { distilledExpectations, interpret, judge, judgeRecording } from "../scripts/oracle/oracle.ts";
import { grid } from "../scripts/oracle/join-grid.ts";

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
    ["print(0.1 + 0.2)", "0.3"],
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
