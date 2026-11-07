// `scripts/sweep.vl`, the proof sweep: `diff` blocks exactly on a lost `runs` or a new
// compiler trap and reports every other movement, `merge` refuses a recording that does
// not cover the population, and `record` writes one line per program of its shard.

import { COMPILER, exists, nativeEnv, ROOT, VL } from "./support/tree.ts";
import { builtScript } from "./support/builtScript.ts";

const SCRIPT = "scripts/sweep.vl";

const GATED = Deno.env.get("SELFHOST_NATIVE_ALIGN") === "1";
const ENABLED = GATED && exists(VL) && exists(COMPILER);
if (GATED && !ENABLED) {
  console.warn("[vl-sweep] skipped — missing vl binary or seed wasm.");
}

const dec = new TextDecoder();

const sweep = async (argv: string[]): Promise<{ code: number; out: string }> => {
  const { code, stdout } = await new Deno.Command(VL, {
    args: ["run", await builtScript(SCRIPT, { cwd: ROOT }), "--", ...argv],
    cwd: ROOT,
    stdout: "piped",
    stderr: "piped",
    env: nativeEnv({ NO_COLOR: "1", JOBS: "2" }),
  }).output();
  return { code, out: dec.decode(stdout) };
};

type Rec = { outcome: string; exit?: number; stdout?: string; module?: string; msg?: string };

const line = (cell: string, r: Rec) =>
  JSON.stringify({
    cell,
    exit: r.exit ?? 0,
    module: r.module ?? "m",
    msg: r.msg ?? "",
    outcome: r.outcome,
    stdout: r.stdout ?? "s",
  }) + "\n";

const write = (dir: string, name: string, recs: Record<string, Rec>) => {
  const p = `${dir}/${name}`;
  Deno.writeTextFileSync(p, Object.entries(recs).map(([c, r]) => line(c, r)).join(""));
  return p;
};

const want = (out: string, row: string, n: number) => {
  const esc = row.replace(/[()]/g, "\\$&");
  const m = new RegExp(`^  ${esc}\\s+(\\d+)$`, "m").exec(out);
  if (!m || Number(m[1]) !== n) {
    throw new Error(`want "${row}" ${n}, got ${m ? m[1] : "no such row"}:\n${out}`);
  }
};

Deno.test({
  name: "sweep diff: counts each kind of mover and blocks only on lost runs and new traps",
  ignore: !ENABLED,
  async fn() {
    const dir = Deno.makeTempDirSync();
    try {
      const base = write(dir, "base.jsonl", {
        same: { outcome: "runs" },
        bytes: { outcome: "runs", module: "a" },
        printed: { outcome: "runs", stdout: "a" },
        loud: { outcome: "check_reject", msg: "x" },
        gone: { outcome: "runs" },
      });
      const quiet = write(dir, "quiet.jsonl", {
        same: { outcome: "runs" },
        bytes: { outcome: "runs", module: "b" },
        printed: { outcome: "runs", stdout: "b" },
        loud: { outcome: "check_reject", msg: "y" },
        added: { outcome: "runs" },
      });
      const q = await sweep(["diff", base, quiet]);
      if (q.code !== 0) throw new Error(`want exit 0, got ${q.code}:\n${q.out}`);
      want(q.out, "same", 1);
      want(q.out, "bytes-only movers", 1);
      want(q.out, "output movers", 2);
      want(q.out, "only in base", 1);
      want(q.out, "only in candidate", 1);
      if (!q.out.includes("    printed  stdout a -> b")) {
        throw new Error(`want the stdout mover listed by key, got:\n${q.out}`);
      }

      const lost = write(dir, "lost.jsonl", {
        same: { outcome: "trap", exit: 1 },
        loud: { outcome: "compiler_trap", exit: 70 },
      });
      const l = await sweep(["diff", base, lost]);
      if (l.code !== 1) throw new Error(`want exit 1, got ${l.code}:\n${l.out}`);
      want(l.out, "runs -> not-runs  (blocking)", 1);
      want(l.out, "new compiler traps  (blocking)", 1);
    } finally {
      Deno.removeSync(dir, { recursive: true });
    }
  },
});

Deno.test({
  name: "sweep record writes one line per program of its shard, and merge refuses a gap",
  ignore: !ENABLED,
  async fn() {
    const dir = Deno.makeTempDirSync();
    try {
      const out = `${dir}/rec.jsonl`;
      const r = await sweep([
        "record", "--compiler", COMPILER, "--population", "distilled",
        "--shard", "1/1000", "--out", out,
      ]);
      if (r.code !== 0) throw new Error(`record: want exit 0, got ${r.code}:\n${r.out}`);
      const m = /recorded (\d+) of (\d+) distilled programs/.exec(r.out);
      if (!m) throw new Error(`want the record summary, got:\n${r.out}`);
      const lines = Deno.readTextFileSync(out).split("\n").filter((x) => x !== "");
      const wantN = Math.ceil(Number(m[2]) / 1000);
      if (lines.length !== Number(m[1]) || lines.length !== wantN) {
        throw new Error(`want ${wantN} lines, got ${lines.length} (summary ${m[1]})`);
      }
      for (const l of lines) {
        const j = JSON.parse(l);
        for (const k of ["cell", "exit", "module", "msg", "outcome", "stdout"]) {
          if (!(k in j)) throw new Error(`want field ${k} in ${l}`);
        }
      }
      const g = await sweep(["merge", "--out", `${dir}/m.jsonl`, "--population", "distilled", out]);
      if (g.code !== 1 || !g.out.includes("missing")) {
        throw new Error(`merge of one shard: want exit 1 naming what is missing, got ${g.code}:\n${g.out}`);
      }
    } finally {
      Deno.removeSync(dir, { recursive: true });
    }
  },
});
