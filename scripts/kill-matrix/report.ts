// Reads a kill-matrix run (scripts/kill-matrix/run.sh) and prints, per mutant, the checks that
// caught it; per check, its catches, how many no other check made, and its cost; and the
// checks a greedy pass can drop, most expensive first, while every caught mutant keeps at
// least one catcher. docs/internals/testing-strategy.md says how a deletion is decided.
//
//   deno run -A scripts/kill-matrix/report.ts [DIR] [--json OUT]
//
// A CHECK is a gate.sh row, except that a row running `deno test` is split into its test
// files (from the row's junit), so a suite is weighed file by file. A row's cost is its CPU
// seconds in the pristine run; a file's is its summed test seconds there.

const args = Deno.args.slice();
const jsonAt = args.indexOf("--json");
const jsonOut = jsonAt >= 0 ? args.splice(jsonAt, 2)[1] : "";
const dir = args[0] ??
  `${Deno.env.get("TMPDIR") ?? "/tmp"}/vl-kill-matrix`;

function read(p: string): string {
  try {
    return Deno.readTextFileSync(p);
  } catch {
    return "";
  }
}

type Run = {
  rows: Map<string, { ok: boolean; cpu: number }>;
  files: Map<string, { ok: boolean; secs: number }>;
};

function parse(d: string): Run {
  const rows = new Map<string, { ok: boolean; cpu: number }>();
  for (
    const m of read(`${d}/gate.log`).matchAll(
      /^(.{22}) +([\d.]+)s +([\d.]+)s +(ok|FAILED)/gm,
    )
  ) rows.set(m[1].trim(), { ok: m[4] === "ok", cpu: Number(m[3]) });
  const files = new Map<string, { ok: boolean; secs: number }>();
  let logs: Deno.DirEntry[] = [];
  try {
    logs = [...Deno.readDirSync(`${d}/logs`)];
  } catch { /* no logs */ }
  for (const e of logs) {
    if (!/^j\d+\.xml$/.test(e.name)) continue;
    const x = read(`${d}/logs/${e.name}`);
    for (
      const m of x.matchAll(
        /<testcase\b([^>]*?)(\/>|>([\s\S]*?)<\/testcase>)/g,
      )
    ) {
      const attrs = m[1];
      const cls = (attrs.match(/classname="([^"]*)"/)?.[1] ?? "").replace(
        /^\.\//,
        "",
      );
      const secs = Number(attrs.match(/time="([^"]*)"/)?.[1] ?? 0);
      const failed = /<(failure|error)\b/.test(m[3] ?? "");
      const f = files.get(cls) ?? { ok: true, secs: 0 };
      f.secs += secs;
      if (failed) f.ok = false;
      files.set(cls, f);
    }
  }
  return { rows, files };
}

const DENO_ROWS = new Set([
  "deno task test",
  "ci-native",
  "lsp suites (ci list)",
  "scaling shape",
  "inventory refs",
  "conflict markers",
]);

const pristine = parse(`${dir}/pristine`);
const cost = new Map<string, number>();
for (const [r, v] of pristine.rows) {
  if (!DENO_ROWS.has(r)) cost.set(`row:${r}`, v.cpu);
}
for (const [f, v] of pristine.files) cost.set(`file:${f}`, v.secs);
const pristineRed = [...pristine.rows].filter(([, v]) => !v.ok).map(([r]) => r);

const caught = new Map<string, Set<string>>(); // mutant -> checks
const other: string[] = [];
for (
  const e of [...Deno.readDirSync(dir)].sort((a, b) => a.name < b.name ? -1 : 1)
) {
  if (!e.isDirectory || e.name === "pristine") continue;
  const st = read(`${dir}/${e.name}/status`).trim();
  if (!st.startsWith("gate-rc")) {
    other.push(`${e.name}\t${st || "running"}`);
    continue;
  }
  const r = parse(`${dir}/${e.name}`);
  const s = new Set<string>();
  for (const [row, v] of r.rows) {
    if (v.ok || pristineRed.includes(row)) continue;
    if (!DENO_ROWS.has(row)) s.add(`row:${row}`);
  }
  for (const [f, v] of r.files) {
    if (!v.ok && pristine.files.get(f)?.ok !== false) s.add(`file:${f}`);
  }
  caught.set(e.name, s);
}

console.log(
  `kill matrix ${dir}: ${caught.size} graded, ${other.length} not graded`,
);
if (pristineRed.length) {
  console.log(`pristine run red on: ${pristineRed.join(", ")} (ignored)`);
}
for (const o of other) console.log(`  ${o}`);
console.log("\nmutant -> checks that caught it");
for (const [m, s] of caught) {
  console.log(
    `  ${m.padEnd(22)} ${s.size === 0 ? "SURVIVED" : [...s].sort().join("  ")}`,
  );
}

const by = new Map<string, Set<string>>();
for (const [m, s] of caught) {
  for (const c of s) (by.get(c) ?? by.set(c, new Set()).get(c)!).add(m);
}
console.log("\ncheck -> catches (sole: caught by no other check)    cost");
const rowsOut = [...by].map(([c, ms]) => {
  const sole = [...ms].filter((m) => caught.get(m)!.size === 1);
  return { c, n: ms.size, sole, cost: cost.get(c) ?? 0 };
}).sort((a, b) => b.cost - a.cost);
for (const r of rowsOut) {
  console.log(
    `  ${r.c.padEnd(52)} ${String(r.n).padStart(3)}  sole ${r.sole.length}${
      r.sole.length ? ` (${r.sole.join(", ")})` : ""
    }  ${r.cost.toFixed(1)}s`,
  );
}

// Greedy: most expensive check first; drop it when every mutant it catches keeps a catcher.
const live = new Map([...caught].map(([m, s]) => [m, new Set(s)]));
const dropped: string[] = [];
for (const c of [...cost.keys()].sort((a, b) => cost.get(b)! - cost.get(a)!)) {
  const hit = [...live].filter(([, s]) => s.has(c));
  if (hit.every(([, s]) => s.size >= 2)) {
    for (const [, s] of hit) s.delete(c);
    dropped.push(c);
  }
}
const kept = new Set([...cost.keys()].filter((c) => !dropped.includes(c)));
const save = dropped.reduce((t, c) => t + cost.get(c)!, 0);
console.log(
  `\ngreedy cover: ${kept.size} checks keep every caught mutant caught; ${dropped.length} droppable, ${
    save.toFixed(0)
  } cost-s.`,
);
console.log(
  "A droppable check is a CANDIDATE: a mutant set this small cannot show it is redundant, only that it has not yet been seen to be the sole catcher.",
);
for (const c of dropped.filter((c) => cost.get(c)! >= 1)) {
  console.log(
    `  ${cost.get(c)!.toFixed(1).padStart(6)}s  ${c}  (${
      by.get(c)?.size ?? 0
    } catches)`,
  );
}
if (jsonOut) {
  Deno.writeTextFileSync(
    jsonOut,
    JSON.stringify(
      {
        caught: Object.fromEntries(
          [...caught].map(([m, s]) => [m, [...s].sort()]),
        ),
        cost: Object.fromEntries(cost),
        dropped,
      },
      null,
      1,
    ),
  );
}
