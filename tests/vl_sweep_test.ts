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

const sweep = async (
  argv: string[],
): Promise<{ code: number; out: string }> => {
  const { code, stdout } = await new Deno.Command(VL, {
    args: ["run", await builtScript(SCRIPT, { cwd: ROOT }), "--", ...argv],
    cwd: ROOT,
    stdout: "piped",
    stderr: "piped",
    env: nativeEnv({ NO_COLOR: "1", JOBS: "2" }),
  }).output();
  return { code, out: dec.decode(stdout) };
};

type Rec = {
  outcome: string;
  exit?: number;
  stdout?: string;
  module?: string;
  msg?: string;
};

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
  Deno.writeTextFileSync(
    p,
    Object.entries(recs).map(([c, r]) => line(c, r)).join(""),
  );
  return p;
};

const want = (out: string, row: string, n: number) => {
  const esc = row.replace(/[()]/g, "\\$&");
  const m = new RegExp(`^  ${esc}\\s+(\\d+)$`, "m").exec(out);
  if (!m || Number(m[1]) !== n) {
    throw new Error(
      `want "${row}" ${n}, got ${m ? m[1] : "no such row"}:\n${out}`,
    );
  }
};

Deno.test({
  name:
    "sweep diff: counts each kind of mover and blocks only on lost runs and new traps",
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
      // An explicit empty list, so the repo's own scripts/sweep-owed.txt does not leak in.
      const noOwed = `${dir}/owed.txt`;
      Deno.writeTextFileSync(noOwed, "");
      const q = await sweep(["diff", base, quiet, "--owed", noOwed]);
      if (q.code !== 0) {
        throw new Error(`want exit 0, got ${q.code}:\n${q.out}`);
      }
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
      const l = await sweep(["diff", base, lost, "--owed", noOwed]);
      if (l.code !== 1) {
        throw new Error(`want exit 1, got ${l.code}:\n${l.out}`);
      }
      want(l.out, "runs -> not-runs  (blocking)", 1);
      want(l.out, "new compiler traps  (blocking)", 1);
    } finally {
      Deno.removeSync(dir, { recursive: true });
    }
  },
});

Deno.test({
  name:
    "sweep diff: an owed refusal passes only for a listed clause-1 row's witness refused at check",
  ignore: !ENABLED,
  async fn() {
    const dir = Deno.makeTempDirSync();
    try {
      const base = write(dir, "base.jsonl", {
        owed: { outcome: "runs" },
        trapped: { outcome: "runs" },
        unlisted: { outcome: "runs" },
        still: { outcome: "runs" },
      });
      const refused = write(dir, "refused.jsonl", {
        owed: { outcome: "check_reject", exit: 1, msg: "x" },
        trapped: { outcome: "runs" },
        unlisted: { outcome: "runs" },
        still: { outcome: "runs" },
      });
      const owed = (lines: string) => {
        const p = `${dir}/owed.txt`;
        Deno.writeTextFileSync(p, lines);
        return p;
      };

      // D10042 is a clause-1 row: its listed witness may stop running into a check refusal.
      const ok = await sweep([
        "diff",
        base,
        refused,
        "--owed",
        owed("owed D10042\n"),
      ]);
      if (ok.code !== 0) {
        throw new Error(`want exit 0, got ${ok.code}:\n${ok.out}`);
      }
      want(ok.out, "runs -> not-runs  (blocking)", 0);
      want(ok.out, "owed refusals accepted", 1);

      // Negated controls, each of which must still block.
      // The same move with no list entry is a lost run.
      const none = await sweep(["diff", base, refused, "--owed", owed("")]);
      if (none.code !== 1) {
        throw new Error(
          `unlisted: want exit 1, got ${none.code}:\n${none.out}`,
        );
      }
      want(none.out, "runs -> not-runs  (blocking)", 1);
      // A listed key whose row is not clause 1 (D10010 is clause 2) is refused.
      const c2 = await sweep([
        "diff",
        base,
        refused,
        "--owed",
        owed("owed D10010\n"),
      ]);
      if (c2.code !== 1) {
        throw new Error(`clause 2: want exit 1, got ${c2.code}:\n${c2.out}`);
      }
      // A listed key that moves into anything but a check refusal is still lost.
      const trap = write(dir, "trap.jsonl", {
        owed: { outcome: "trap", exit: 1 },
        trapped: { outcome: "runs" },
        unlisted: { outcome: "runs" },
        still: { outcome: "runs" },
      });
      const t = await sweep([
        "diff",
        base,
        trap,
        "--owed",
        owed("owed D10042\n"),
      ]);
      if (t.code !== 1) {
        throw new Error(`trap: want exit 1, got ${t.code}:\n${t.out}`);
      }
      want(t.out, "runs -> not-runs  (blocking)", 1);
      // A listed key that did not move is stale.
      const stale = await sweep([
        "diff",
        base,
        refused,
        "--owed",
        owed("owed D10042\nstill D10042\n"),
      ]);
      if (stale.code !== 1) {
        throw new Error(`stale: want exit 1, got ${stale.code}:\n${stale.out}`);
      }
      if (!stale.out.includes("still  (listed, but it did not move")) {
        throw new Error(`want the stale entry named, got:\n${stale.out}`);
      }
      // Once the fix is in the base, the entry is inert until the fold clears it.
      const landed = await sweep([
        "diff",
        refused,
        refused,
        "--owed",
        owed("owed D10042\n"),
      ]);
      if (landed.code !== 0) {
        throw new Error(
          `landed: want exit 0, got ${landed.code}:\n${landed.out}`,
        );
      }
    } finally {
      Deno.removeSync(dir, { recursive: true });
    }
  },
});

Deno.test({
  name:
    "sweep record writes one line per program of its shard, and merge refuses a gap",
  ignore: !ENABLED,
  async fn() {
    const dir = Deno.makeTempDirSync();
    try {
      const out = `${dir}/rec.jsonl`;
      const r = await sweep([
        "record",
        "--compiler",
        COMPILER,
        "--population",
        "distilled",
        "--shard",
        "1/1000",
        "--out",
        out,
      ]);
      if (r.code !== 0) {
        throw new Error(`record: want exit 0, got ${r.code}:\n${r.out}`);
      }
      const m = /recorded (\d+) of (\d+) distilled programs/.exec(r.out);
      if (!m) throw new Error(`want the record summary, got:\n${r.out}`);
      const lines = Deno.readTextFileSync(out).split("\n").filter((x) =>
        x !== ""
      );
      const wantN = Math.ceil(Number(m[2]) / 1000);
      if (lines.length !== Number(m[1]) || lines.length !== wantN) {
        throw new Error(
          `want ${wantN} lines, got ${lines.length} (summary ${m[1]})`,
        );
      }
      for (const l of lines) {
        const j = JSON.parse(l);
        for (
          const k of ["cell", "exit", "module", "msg", "outcome", "stdout"]
        ) {
          if (!(k in j)) throw new Error(`want field ${k} in ${l}`);
        }
      }
      const g = await sweep([
        "merge",
        "--out",
        `${dir}/m.jsonl`,
        "--population",
        "distilled",
        out,
      ]);
      if (g.code !== 1 || !g.out.includes("missing")) {
        throw new Error(
          `merge of one shard: want exit 1 naming what is missing, got ${g.code}:\n${g.out}`,
        );
      }
    } finally {
      Deno.removeSync(dir, { recursive: true });
    }
  },
});
