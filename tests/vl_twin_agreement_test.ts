// `scripts/twin-agreement.vl`, held to the output of the Python it replaced, without a probe
// build: the run happens in a scratch root whose `scripts/vl-host/target/release/vl` is a
// stand-in that "builds" the probe at once and answers each program with a canned refusal.
// That pins what is cheap and stable — the argument parser, the patch the instrumenter applies
// to a small compiler tree (callee imports included), the reading of `TWINSWEEP` lines and the
// report — while the real probe build stays a by-hand run.
//
// `fixtures/twin-agreement/input.json` holds the two compiler trees and the canned answers;
// each `<case>.txt` is the Python's output on it, recorded before it was deleted, with the
// scratch path written `<scratch>` and the usage line's program name as `twin-agreement.vl`.
// `instrumented.json` is the tree the Python's `--keep` left behind.
//
// @test-timing native

import { exists, nativeEnv, ROOT, VL } from "./support/tree.ts";
import { builtScript } from "./support/builtScript.ts";

const GATED = Deno.env.get("SELFHOST_NATIVE_ALIGN") === "1";
const ENABLED = GATED && exists(VL) && Deno.build.os !== "windows";
if (GATED && !ENABLED) {
  console.warn("[vl-twin-agreement] skipped — missing vl binary, or Windows.");
}

const FIX = `${ROOT}/tests/fixtures/twin-agreement`;
const dec = new TextDecoder();

type Input = {
  compiler: Record<string, string>;
  unanchored: Record<string, string>;
  canned: Record<string, string>;
  list: string;
};

// The stand-in `vl`: a probe build succeeds, and a program build prints `canned/<name>.txt`
// when there is one, a bare row count for any other kind program, and a refusal otherwise.
const FAKE_VL = `#!/bin/sh
case "$2" in compiler/entry.vl) exit 0;; esac
here=$(dirname "$0")
base=$(basename "$2" .vl)
if [ -f "$here/canned/$base.txt" ]; then cat "$here/canned/$base.txt"; exit 1; fi
case "$2" in */kinds/*) echo "error: TWINSWEEP rows=10"; exit 1;; esac
echo "error: check failed" >&2
exit 1
`;

const CASES: { name: string; args: string[]; code: number }[] = [
  { name: "keep", args: ["--keep", "--list", "list.txt"], code: 1 },
  { name: "twins", args: ["--twins", "arr,vak"], code: 1 },
  {
    name: "unanchored",
    args: ["--source", "unanchored", "--twins", "tep"],
    code: 1,
  },
  { name: "help", args: ["--help"], code: 0 },
  { name: "bogus", args: ["--bogus", "x"], code: 2 },
  { name: "ambiguous", args: ["--s", "x"], code: 2 },
  { name: "unknown", args: ["--twins", "vak,zz"], code: 1 },
];

const writeTree = async (dir: string, files: Record<string, string>) => {
  await Deno.mkdir(dir, { recursive: true });
  for (const [n, s] of Object.entries(files)) {
    await Deno.writeTextFile(`${dir}/${n}`, s);
  }
};

// The scratch root: both compiler trees, the list, and the stand-in `vl` beside its answers.
const materialise = async (root: string, input: Input) => {
  await writeTree(`${root}/compiler`, input.compiler);
  await writeTree(`${root}/unanchored`, input.unanchored);
  await Deno.writeTextFile(`${root}/list.txt`, input.list);
  const bin = `${root}/scripts/vl-host/target/release`;
  const canned: Record<string, string> = {};
  for (const [n, s] of Object.entries(input.canned)) canned[`${n}.txt`] = s;
  await writeTree(`${bin}/canned`, canned);
  await Deno.writeTextFile(`${bin}/vl`, FAKE_VL);
  await Deno.chmod(`${bin}/vl`, 0o755);
  await Deno.mkdir(`${root}/tmp`);
};

const readTree = async (dir: string): Promise<Record<string, string>> => {
  const out: Record<string, string> = {};
  const names: string[] = [];
  for await (const e of Deno.readDir(dir)) names.push(e.name);
  for (const n of names.sort()) out[n] = await Deno.readTextFile(`${dir}/${n}`);
  return out;
};

Deno.test({
  name: "twin-agreement: every case prints what its Python printed",
  ignore: !ENABLED,
  fn: async () => {
    const root = await Deno.makeTempDir({ prefix: "vl_twin_agreement_" });
    try {
      const input: Input = JSON.parse(
        await Deno.readTextFile(`${FIX}/input.json`),
      );
      await materialise(root, input);
      const bad: string[] = [];
      for (const c of CASES) {
        const { code, stdout } = await new Deno.Command(VL, {
          args: ["run", await builtScript(`${ROOT}/scripts/twin-agreement.vl`, { compiler: null }), "--", ...c.args],
          cwd: root,
          stdout: "piped",
          stderr: "piped",
          env: nativeEnv({ NO_COLOR: "1", TMPDIR: `${root}/tmp` }),
        }).output();
        const left: string[] = [];
        for await (const e of Deno.readDir(`${root}/tmp`)) left.push(e.name);
        let out = dec.decode(stdout);
        if (c.name === "keep") {
          if (left.length !== 1) {
            bad.push(`[keep] want one scratch tree kept, got ${left}`);
            continue;
          }
          const scratch = `${root}/tmp/${left[0]}`;
          out = out.replaceAll(scratch, "<scratch>");
          const want = await Deno.readTextFile(`${FIX}/instrumented.json`);
          const got = JSON.stringify(
            await readTree(`${scratch}/compiler`),
            null,
            2,
          ) + "\n";
          if (got !== want) {
            bad.push(`[keep tree] want:\n${want}got:\n${got}`);
          }
          await Deno.remove(scratch, { recursive: true });
        } else if (left.length !== 0) {
          bad.push(`[${c.name}] want no scratch tree left, got ${left}`);
        }
        const want = await Deno.readTextFile(`${FIX}/${c.name}.txt`);
        if (code !== c.code || out !== want) {
          bad.push(
            `[${c.name}] want exit ${c.code}:\n${want}got exit ${code}:\n${out}`,
          );
        }
      }
      if (bad.length > 0) throw new Error(bad.join("\n\n"));
    } finally {
      await Deno.remove(root, { recursive: true });
    }
  },
});
