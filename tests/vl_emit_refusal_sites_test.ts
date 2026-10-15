// `scripts/emit-refusal-sites.vl`, the derivation of the emit-side refusal-site population,
// held to the output of the Python it replaced.
//
// The port was graded against the `.py` on the real `compiler/` in every mode (the default
// summary, `--groups`, `--full`, seeded `--sample` draws on both of CPython's sampling paths,
// `--json`, and argparse's abbreviations and errors): stdout, exit code and the JSON file were
// byte-identical. Two things changed on purpose: usage errors print on stdout, because VL has
// no stderr sink, and a sample larger than the population prints one line, not a traceback.
//
// `fixtures/emit-refusal-sites/compiler/` is a made-up compiler tree with one site per group
// and the parsing edge cases; each `<case>.txt` and `sites.json` is the Python's output on it,
// recorded before it was deleted. The script reads `compiler/` against the working directory.
//
// @test-timing native

import { COMPILER, exists, nativeEnv, ROOT, VL } from "./support/tree.ts";

const GATED = Deno.env.get("SELFHOST_NATIVE_ALIGN") === "1";
const ENABLED = GATED && exists(VL) && exists(COMPILER);
if (GATED && !ENABLED) {
  console.warn("[vl-emit-refusal-sites] skipped — missing vl binary or seed wasm.");
}

const FIX = `${ROOT}/tests/fixtures/emit-refusal-sites`;
const SCRIPT = `${ROOT}/scripts/emit-refusal-sites.vl`;
const dec = new TextDecoder();

const CASES: { name: string; args: string[]; code: number }[] = [
  { name: "default", args: [], code: 0 },
  { name: "groups", args: ["--groups"], code: 0 },
  { name: "full", args: ["--full"], code: 0 },
  { name: "sample-pool", args: ["--sample", "10"], code: 0 },
  { name: "sample-set", args: ["--sample", "5", "--seed", "3"], code: 0 },
  { name: "bad-flag", args: ["--bogus"], code: 2 },
  { name: "json", args: ["--json", "out.json"], code: 0 },
];

Deno.test({
  name: "emit-refusal-sites: every mode prints what its Python printed",
  ignore: !ENABLED,
  fn: async () => {
    const dir = await Deno.makeTempDir({ prefix: "vl_emit_refusal_sites_" });
    try {
      await Deno.mkdir(`${dir}/compiler`);
      for await (const e of Deno.readDir(`${FIX}/compiler`)) {
        await Deno.copyFile(`${FIX}/compiler/${e.name}`, `${dir}/compiler/${e.name}`);
      }
      const bad: string[] = [];
      for (const c of CASES) {
        const { code, stdout } = await new Deno.Command(VL, {
          args: ["run", SCRIPT, "--", ...c.args],
          cwd: dir,
          stdout: "piped",
          stderr: "piped",
          env: nativeEnv({ NO_COLOR: "1" }),
        }).output();
        const out = dec.decode(stdout);
        const want = await Deno.readTextFile(`${FIX}/${c.name}.txt`);
        if (code !== c.code || out !== want) {
          bad.push(`[${c.name}] want exit ${c.code}:\n${want}got exit ${code}:\n${out}`);
        }
      }
      const json = await Deno.readTextFile(`${dir}/out.json`);
      const wantJson = await Deno.readTextFile(`${FIX}/sites.json`);
      if (json !== wantJson) bad.push(`[sites.json] want:\n${wantJson}\ngot:\n${json}`);
      if (bad.length > 0) throw new Error(bad.join("\n\n"));
    } finally {
      await Deno.remove(dir, { recursive: true });
    }
  },
});
