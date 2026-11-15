// The independent oracle's command line (docs/internals/refactor-notes/2026-11-14-oracle-design.md).
//
//   deno run -A scripts/oracle/oracle.ts run <file.vl>
//   deno run -A scripts/oracle/oracle.ts distilled [--grades <regress.json>] [--json OUT] [--budget-ms N]
//   deno run -A scripts/oracle/oracle.ts diff <cases-dir> <vl-batch-out-dir> [--json OUT]
//   deno run -A scripts/oracle/oracle.ts recording <head.jsonl> [--base <base.jsonl>] [--population P] [--budget-ms N]
//
// `run` exits 0 on a clean run, 3 on a trap, 4 on a type fault and 5 outside the subset.
// `distilled` and `diff` exit 1 when any DISAGREE or UNSOUND verdict is not in
// scripts/oracle/known.txt, 2 on a usage or budget failure, else 0.

import { Interp, Trap, TypeFault } from "./interp.ts";
import { Unsupported } from "./syntax.ts";

export type Outcome = { kind: "ok" | "trap" | "fault" | "unsupported"; out: string[]; msg: string };

export function interpret(src: string, fuel = 2_000_000): Outcome {
  const it = new Interp(fuel);
  try {
    it.run(src);
    return { kind: "ok", out: it.out, msg: "" };
  } catch (e) {
    if (e instanceof Trap) return { kind: "trap", out: it.out, msg: e.message };
    if (e instanceof TypeFault) return { kind: "fault", out: it.out, msg: e.message };
    if (e instanceof Unsupported) return { kind: "unsupported", out: it.out, msg: e.message };
    if (e instanceof RangeError) return { kind: "unsupported", out: it.out, msg: "host stack: " + e.message };
    // Anything else is a defect in the oracle itself: say so, never a verdict about VL.
    return { kind: "unsupported", out: it.out, msg: "ORACLE BUG: " + (e instanceof Error ? e.stack ?? e.message : String(e)) };
  }
}

// One cell's verdict, from the oracle's outcome and the compiled side's.
//   AGREE        both ran and printed the same thing, or both refused/trapped alike
//   DISAGREE     the compiled program ran and printed something else, or trapped where the oracle ran
//   UNSOUND      the checker accepted a program the oracle caught putting a value where its type forbids
//   COMPILED-BAD the compiled side failed (invalid wasm, trap, wrong value) and the oracle ran it
//   ORACLE-RUNS-REJECTED  `vl check` refused it, the oracle ran it to the expected output (clause-2 evidence)
//   SKIP         outside the oracle subset
export type Verdict = "AGREE" | "DISAGREE" | "UNSOUND" | "COMPILED-BAD" | "ORACLE-RUNS-REJECTED" | "SKIP";

export type Compiled = { cls: "runs" | "rejected" | "trap" | "invalid" | "wrong"; out: string[] | null };

export function judge(o: Outcome, c: Compiled, expect: string[] | null): { v: Verdict; why: string } {
  // Compared as text: one empty line and no output are the same stdout once trailing newlines go.
  const same = (a: string[], b: string[]) => a.join("\n") === b.join("\n");
  if (o.kind === "unsupported") return { v: "SKIP", why: o.msg };
  if (o.kind === "fault") {
    if (c.cls === "rejected") return { v: "AGREE", why: "checker refused; oracle faulted: " + o.msg };
    return { v: "UNSOUND", why: o.msg };
  }
  if (c.cls === "rejected") {
    if (o.kind === "ok" && expect && same(o.out, expect)) return { v: "ORACLE-RUNS-REJECTED", why: "" };
    return { v: "AGREE", why: "checker refused" };
  }
  if (o.kind === "trap") {
    if (c.cls === "trap") return { v: "AGREE", why: "both trap" };
    if (c.cls === "invalid") return { v: "COMPILED-BAD", why: `compiled invalid; oracle traps (${o.msg})` };
    return { v: "DISAGREE", why: `oracle traps (${o.msg}); compiled ${c.cls}` + (c.out ? ` printing ${JSON.stringify(c.out)}` : "") };
  }
  // the oracle ran
  if (c.cls === "runs") {
    const got = c.out ?? expect ?? [];
    if (same(o.out, got)) return { v: "AGREE", why: "" };
    return { v: "DISAGREE", why: `oracle ${JSON.stringify(o.out)} compiled ${JSON.stringify(got)}` };
  }
  // `wrong`: the compiled stdout differs from the expectation. With the stdout in hand compare to
  // it; without it, an oracle that prints the expectation confirms the compiled side is wrong.
  if (c.cls === "wrong") {
    if (c.out && same(o.out, c.out)) return { v: "DISAGREE", why: "oracle agrees with the compiled output, not the expectation" };
    if (expect && same(o.out, expect)) return { v: "COMPILED-BAD", why: "compiled a wrong value; the oracle prints the expectation" };
    return { v: "DISAGREE", why: `oracle ${JSON.stringify(o.out)} matches neither the expectation nor the compiled output` };
  }
  return { v: "COMPILED-BAD", why: `compiled ${c.cls}; oracle ran ${JSON.stringify(o.out)}` };
}

function loadJsonl(path: string): Record<string, unknown>[] {
  return Deno.readTextFileSync(path).split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l));
}
function classOf(s: string): Compiled["cls"] {
  if (s === "runs") return "runs";
  if (s === "runs but wrong value") return "wrong";
  if (s === "trap_loads") return "trap";
  if (s === "check-clean invalid wasm") return "invalid";
  if (s.startsWith("loud")) return "rejected";
  return "invalid"; // compiler trap
}
function known(): Set<string> {
  try {
    return new Set(Deno.readTextFileSync(new URL("./known.txt", import.meta.url)).split("\n").map((l) => l.split("#")[0].trim()).filter((l) => l));
  } catch { return new Set(); }
}

// `sig` (recording mode only): the compiled stdout hash and outcome, which a base diff compares.
type Row = { cell: string; verdict: Verdict; why: string; sig?: string };

function report(rows: Row[], jsonOut: string | null, elapsed: number, base: Set<string> | null = null): number {
  const counts = new Map<string, number>();
  for (const r of rows) counts.set(r.verdict, (counts.get(r.verdict) ?? 0) + 1);
  const k = known();
  const inBase = (r: Row) => base !== null && base.has(sigOf(r));
  const fresh = rows.filter((r) => (r.verdict === "DISAGREE" || r.verdict === "UNSOUND") && !k.has(r.cell) && !inBase(r));
  for (const r of rows.filter((r) => r.verdict === "DISAGREE" || r.verdict === "UNSOUND" || r.verdict === "COMPILED-BAD")) {
    console.log(`${r.verdict.padEnd(12)} ${r.cell}${k.has(r.cell) ? " (known)" : inBase(r) ? " (on the base too)" : ""}  ${r.why.slice(0, 300)}`);
  }
  if (jsonOut) Deno.writeTextFileSync(jsonOut, rows.map((r) => JSON.stringify(r)).join("\n") + "\n");
  const ran = rows.length - (counts.get("SKIP") ?? 0);
  console.log(
    `oracle: ${rows.length} cells, ${ran} in subset (${(100 * ran / Math.max(rows.length, 1)).toFixed(1)}%), ` +
      [...counts].sort().map(([v, n]) => `${v} ${n}`).join(", ") + `; ${fresh.length} new disagreement(s); ${elapsed} ms`,
  );
  return fresh.length ? 1 : 0;
}

function skipReasons(rows: Row[]) {
  const c = new Map<string, number>();
  for (const r of rows) if (r.verdict === "SKIP") { const k = r.why.replace(/line \d+/g, "line N").replace(/at \d+/g, "").slice(0, 70); c.set(k, (c.get(k) ?? 0) + 1); }
  console.log("skip reasons (top 25):");
  for (const [k, n] of [...c].sort((a, b) => b[1] - a[1]).slice(0, 25)) console.log(`  ${String(n).padStart(6)}  ${k}`);
}

function distilled(args: string[]): number {
  const root = "scripts/silent-sweep/distilled";
  const gradesPath = flag(args, "--grades") ?? root + "/baseline.jsonl";
  const budget = Number(flag(args, "--budget-ms") ?? "0");
  const only = flag(args, "--only");
  const grades = new Map<string, string>();
  for (const r of loadJsonl(gradesPath)) grades.set(String(r.cell), String(r.class));
  const t0 = Date.now();
  const rows: Row[] = [];
  for (const sub of ["cells", "named"]) {
    const man = JSON.parse(Deno.readTextFileSync(`${root}/${sub}/manifest.json`)).expect as Record<string, string>;
    for (const cell of Object.keys(man).sort()) {
      if (only && !cell.startsWith(only)) continue;
      if (budget && Date.now() - t0 > budget) {
        console.log(`oracle: wall-clock budget ${budget} ms exhausted after ${rows.length} cells`);
        return 2;
      }
      const src = Deno.readTextFileSync(`${root}/${sub}/${cell}.vl`);
      const expect = man[cell] === "" ? [] : man[cell].split("\n");
      const cls = grades.get(cell);
      const o = interpret(src);
      if (!cls) { rows.push({ cell, verdict: "SKIP", why: "no grade" }); continue; }
      const j = judge(o, { cls: classOf(cls), out: null }, expect);
      rows.push({ cell, verdict: j.v, why: j.why });
    }
  }
  if (args.includes("--skips")) skipReasons(rows);
  return report(rows, flag(args, "--json"), Date.now() - t0);
}

// `vl run --batch` wrote <name>.out for every case and <name>.err for a failing one.
function diff(args: string[]): number {
  const [cases, outDir] = args;
  const t0 = Date.now();
  const rows: Row[] = [];
  for (const ent of [...Deno.readDirSync(cases)].map((e) => e.name).filter((n) => n.endsWith(".vl")).sort()) {
    const src = Deno.readTextFileSync(`${cases}/${ent}`);
    const o = interpret(src);
    let out: string[] = [];
    let err = "";
    // Each printed line ends in a newline; only that last terminator goes, so a final `print("")`
    // stays one empty line.
    try {
      const raw = Deno.readTextFileSync(`${outDir}/${ent}.out`);
      out = raw === "" ? [] : (raw.endsWith("\n") ? raw.slice(0, -1) : raw).split("\n");
    } catch { /* none */ }
    try { err = Deno.readTextFileSync(`${outDir}/${ent}.err`); } catch { /* none */ }
    let cls: Compiled["cls"] = "runs";
    if (err) {
      // fuzz-vl.sh's classes: a check or parse refusal, then a module that does not build
      // (an emit refusal counts here: the checker accepted the program), then a trap.
      if (/type error|parse error/.test(err)) cls = "rejected";
      else if (/emit error|failed to compile|failed to parse WebAssembly|translation error|Invalid input WebAssembly/.test(err)) cls = "invalid";
      else cls = "trap";
    }
    const j = judge(o, { cls, out }, null);
    rows.push({ cell: ent.replace(/\.vl$/, ""), verdict: j.v, why: j.why + (cls !== "runs" && cls !== "rejected" ? " | " + err.split("\n")[0].slice(0, 160) : "") });
  }
  if (args.includes("--skips")) skipReasons(rows);
  return report(rows, flag(args, "--json"), Date.now() - t0);
}

// A scripts/sweep.vl recording: `stdout` is the first 16 hex digits of the sha256 of what the
// compiled program printed, so the oracle compares hashes and compiles nothing itself.
//
// A distilled cell's manifest expectation is a third opinion. When the oracle prints it and the
// compiled program does not, the corpus already grades the cell `runs but wrong value`, so it is
// COMPILED-BAD, not a new disagreement. `--base <base.jsonl>` judges the base recording the same
// way, and a disagreement the base already had (same cell, verdict and compiled stdout) is not new.
async function recording(args: string[]): Promise<number> {
  const t0 = Date.now();
  const budget = Number(flag(args, "--budget-ms") ?? "0");
  const only = flag(args, "--population") ?? "";
  const expects = distilledExpectations();
  const head = await judgeRecording(args[0], only, budget, t0, expects);
  if (!head) return 2;
  let base: Set<string> | null = null;
  const basePath = flag(args, "--base");
  if (basePath) {
    const b = await judgeRecording(basePath, only, budget, t0, expects);
    if (!b) return 2;
    base = new Set(b.map(sigOf));
  }
  if (args.includes("--skips")) skipReasons(head);
  return report(head, flag(args, "--json"), Date.now() - t0, base);
}

function sigOf(r: Row): string { return `${r.cell}\t${r.verdict}\t${r.sig ?? ""}`; }

// Every distilled cell's expected stdout, keyed by its path from the checkout root.
export function distilledExpectations(): Map<string, string> {
  const m = new Map<string, string>();
  const root = "scripts/silent-sweep/distilled";
  for (const sub of ["cells", "named"]) {
    try {
      const man = JSON.parse(Deno.readTextFileSync(`${root}/${sub}/manifest.json`)).expect as Record<string, string>;
      for (const [cell, want] of Object.entries(man)) m.set(`${root}/${sub}/${cell}.vl`, want);
    } catch { /* no manifest: no expectations */ }
  }
  return m;
}

export async function judgeRecording(path: string, only: string, budget: number, t0: number, expects: Map<string, string>): Promise<Row[] | null> {
  const rows: Row[] = [];
  const enc = new TextEncoder();
  for (const rec of loadJsonl(path)) {
    const key = String(rec.cell);
    if (!key.endsWith(".vl") || key.includes("#") || (only && !key.includes(only))) continue;
    if (budget && Date.now() - t0 > budget) { console.log(`oracle: wall-clock budget ${budget} ms exhausted after ${rows.length} programs`); return null; }
    const outcome = String(rec.outcome);
    if (outcome === "check_clean" || outcome === "timeout") continue;
    let src: string;
    try { src = Deno.readTextFileSync(key); } catch { continue; }
    const o = interpret(src);
    const cls: Compiled["cls"] = outcome === "runs" ? "runs" : outcome === "check_reject" ? "rejected" : outcome === "trap" || outcome === "run_error" ? "trap" : "invalid";
    let j = judge(o, { cls, out: [] }, null);
    if (o.kind === "ok" && cls === "runs") {
      const text = o.out.length ? o.out.join("\n") + "\n" : "";
      const h = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(text)))).map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 16);
      const want = expects.get(key);
      if (h === String(rec.stdout)) j = { v: "AGREE", why: "" };
      else if (want !== undefined && o.out.join("\n") === want) j = { v: "COMPILED-BAD", why: "compiled a wrong value; the oracle prints the corpus expectation" };
      else j = { v: "DISAGREE", why: `oracle printed ${JSON.stringify(o.out).slice(0, 200)}, a different stdout hash` };
    }
    rows.push({ cell: key, verdict: j.v, why: j.why, sig: String(rec.stdout ?? "") + "/" + outcome });
  }
  return rows;
}

function flag(args: string[], name: string): string | null {
  const i = args.indexOf(name);
  return i >= 0 && i + 1 < args.length ? args[i + 1] : null;
}

if (import.meta.main) {
  const [cmd, ...rest] = Deno.args;
  if (cmd === "run") {
    const o = interpret(Deno.readTextFileSync(rest[0]));
    for (const l of o.out) console.log(l);
    if (o.kind !== "ok") console.error(`oracle: ${o.kind}: ${o.msg}`);
    Deno.exit({ ok: 0, trap: 3, fault: 4, unsupported: 5 }[o.kind]);
  } else if (cmd === "distilled") Deno.exit(distilled(rest));
  else if (cmd === "diff") Deno.exit(diff(rest));
  else if (cmd === "recording") Deno.exit(await recording(rest));
  else {
    console.error("usage: oracle.ts run <file.vl> | distilled [--grades F] [--json OUT] [--budget-ms N] | diff <cases> <outdir>");
    Deno.exit(2);
  }
}
