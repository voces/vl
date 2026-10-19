// `scripts/dup-census.vl`, the duplicate-code discovery census, on fixtures whose answers are
// known by construction. Each fixture directory under `fixtures/dup-census/` plants one fact:
//
//   clone/     one 30-token run copied into two files (after an import and a comment)
//   rename/    `a + a`, `b + b` and `b + c`: same shape under renaming, and a blind-only match
//   straddle/  s3 holds s1's tail followed by s2's head, which only a missing file sentinel joins
//   run/       one long `x, x, x, ...` list, which repeats only by overlapping itself
//
// Every run passes `--verify`, which checks each mode's suffix-array order and LCP against a
// naive comparison, so a broken sort fails here rather than skewing a count.
//
// @test-timing native

import { COMPILER, exists, nativeEnv, ROOT, VL } from "./support/tree.ts";

const GATED = Deno.env.get("SELFHOST_NATIVE_ALIGN") === "1";
const ENABLED = GATED && exists(VL) && exists(COMPILER);
if (GATED && !ENABLED) {
  console.warn("[vl-dup-census] skipped — missing vl binary or seed wasm.");
}

const FIX = `${ROOT}/tests/fixtures/dup-census`;
const dec = new TextDecoder();

type Block = {
  tokens: number;
  lines: number;
  copies: number;
  score: number;
  at: string[];
};
type Point = { min: number; tokens: number; lines: number };
type Mode = { mode: string; curve: Point[]; blocks: Block[] };
type Report = { files: number; tokens: number; lines: number; modes: Mode[] };

const slim = (b: Block[]) => b.map((x) => ({ tokens: x.tokens, at: x.at }));
const show = (b: Block[]): string => JSON.stringify(slim(b));

const modeOf = (r: Report, m: string): Mode => {
  const got = r.modes.find((x) => x.mode === m);
  if (got === undefined) {
    throw new Error(`want a "${m}" section, got ${JSON.stringify(r.modes)}`);
  }
  return got;
};

const expect = (bad: string[], what: string, want: unknown, got: unknown) => {
  const w = JSON.stringify(want);
  const g = JSON.stringify(got);
  if (w !== g) bad.push(`${what}: want ${w}, got ${g}`);
};

Deno.test({
  name:
    "dup-census: planted clones are found, renames match by mode, sentinels and overlap hold",
  ignore: !ENABLED,
  fn: async () => {
    const dir = await Deno.makeTempDir({ prefix: "vl_dup_census_" });
    try {
      const wasm = `${dir}/dup-census.wasm`;
      const b = await new Deno.Command(VL, {
        args: ["build", `${ROOT}/scripts/dup-census.vl`, "-o", wasm],
        stdout: "piped",
        stderr: "piped",
        env: nativeEnv({ NO_COLOR: "1" }),
      }).output();
      if (b.code !== 0) {
        throw new Error(
          `vl build dup-census.vl failed:\n${dec.decode(b.stderr)}`,
        );
      }

      const census = async (fixture: string): Promise<Report> => {
        const { code, stdout, stderr } = await new Deno.Command(VL, {
          args: [
            "run",
            wasm,
            "--",
            fixture,
            "--min",
            "6",
            "--json",
            "--verify",
          ],
          cwd: FIX,
          stdout: "piped",
          stderr: "piped",
          env: nativeEnv({ NO_COLOR: "1" }),
        }).output();
        const out = dec.decode(stdout);
        if (code !== 0) {
          throw new Error(
            `[${fixture}] want exit 0, got ${code}:\n${out}${
              dec.decode(stderr)
            }`,
          );
        }
        return JSON.parse(out) as Report;
      };
      const [clone, rename, straddle, run] = await Promise.all(
        ["clone", "rename", "straddle", "run"].map(census),
      );
      const bad: string[] = [];

      // The planted 30-token run, at its own line in each file, in every mode: it has no
      // renaming in it, so all three see the same block, and the import and comment are not in it.
      for (const m of ["exact", "param", "blind"]) {
        expect(bad, `clone ${m} blocks`, [{
          tokens: 30,
          at: ["clone/a.vl:4", "clone/b.vl:3"],
        }], slim(modeOf(clone, m).blocks));
      }

      // `a + a` and `b + b` are one p-string; `b + c` is not. Blind sees all three, exact none.
      expect(bad, "rename exact blocks", [], modeOf(rename, "exact").blocks);
      expect(bad, "rename param blocks", [{
        tokens: 6,
        at: ["rename/f1.vl:1", "rename/f2.vl:1"],
      }], slim(modeOf(rename, "param").blocks));
      expect(bad, "rename blind blocks", [{
        tokens: 6,
        at: ["rename/f1.vl:1", "rename/f2.vl:1", "rename/f3.vl:1"],
      }], slim(modeOf(rename, "blind").blocks));

      // s1's tail + s2's head is 27 tokens in s3 and would be one block without a sentinel per
      // file. The longest honest match is s1 whole (18 tokens in param/blind, where `head` and
      // `other` are both a first occurrence), and no block may hold copies in both s1 and s2.
      for (const m of ["exact", "param", "blind"]) {
        const bs = modeOf(straddle, m).blocks;
        if (bs.length === 0) {
          bad.push(
            `straddle ${m}: want the two per-file halves, got no blocks`,
          );
        }
        for (const x of bs) {
          if (x.tokens > 18) {
            bad.push(
              `straddle ${m}: want no block over 18 tokens, got ${show([x])}`,
            );
          }
          const files = x.at.map((a) => a.split(":")[0]);
          if (
            files.includes("straddle/s1.vl") && files.includes("straddle/s2.vl")
          ) {
            bad.push(
              `straddle ${m}: want no block with copies in s1 and s2, got ${
                show([x])
              }`,
            );
          }
        }
      }

      // A run that repeats only by overlapping itself is not a clone: no block, no coverage.
      for (const m of ["exact", "param", "blind"]) {
        const md = modeOf(run, m);
        expect(bad, `run ${m} blocks`, [], md.blocks);
        expect(bad, `run ${m} tokens covered at L=10`, 0, md.curve[0].tokens);
      }

      if (bad.length > 0) throw new Error(bad.join("\n"));
    } finally {
      await Deno.remove(dir, { recursive: true });
    }
  },
});
