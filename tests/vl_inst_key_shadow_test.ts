// The canonical instance key (architecture-target §3.4) partitions mono's instances exactly as
// mono's own key does, except where two of mono's keys spell one instance: those it merges. The
// key is computed under `$VL_REP_SHADOW` beside mono's (`instKeyNote`, emit_inst_key.vl), and each
// merge reports as `instKey merge -> <template>`. Want: the merges below and no other. A merge
// anywhere else is a template the switch would change. `VL_INST_KEY_FULL=1` sweeps all of
// `tests/cases`.
import { filePath } from "./support/filePath.ts";
const ROOT = filePath(new URL("..", import.meta.url)).replace(/[\\/]$/, "");
const VL = `${ROOT}/scripts/vl-host/target/release/vl${
  Deno.build.os === "windows" ? ".exe" : ""
}`;
const COMPILER = `${ROOT}/build/vl-compiler.wasm`;
const POOL = 4;

// The instances two of mono's keys spell, each pair with identical bodies.
const MERGES: Record<string, string[]> = {
  "tests/cases/closures/generic-returned-record-param.vl": ["deliver"],
  "tests/cases/generics/instance-call-of-literal-union-field-function.vl": [
    "F$m1294891004",
  ],
};
// Controls: instances the key must keep apart (callback specialization; one nested generic per
// enclosing call frame; one helper handed two tagged sets of one signature).
const CONTROLS = [
  "tests/cases/closures/callback-specialization.vl",
  "tests/cases/generics/nested-generic-capture-callers-that-run.vl",
  "tests/cases/closures/tagged-sets-of-one-signature-to-one-helper-keep-two-instances.vl",
];

const exists = (p: string) => {
  try {
    Deno.statSync(p);
    return true;
  } catch {
    return false;
  }
};
const ENABLED = exists(VL) && exists(COMPILER);

const walk = (dir: string, out: string[]) => {
  for (const e of Deno.readDirSync(`${ROOT}/${dir}`)) {
    const rel = `${dir}/${e.name}`;
    if (e.isDirectory) walk(rel, out);
    else if (e.name.endsWith(".vl")) out.push(rel);
  }
  return out;
};

const sweep = async (rel: string, dir: string, i: number) => {
  const { code, stderr, stdout } = await new Deno.Command(VL, {
    args: ["build", rel, "--compiler", COMPILER, "-o", `${dir}/${i}.wasm`],
    cwd: ROOT,
    stdout: "piped",
    stderr: "piped",
    env: {
      RUST_BACKTRACE: "0",
      NO_COLOR: "1",
      VL_STD: `${ROOT}/std`,
      VL_REP_SHADOW: "1",
    },
  }).output();
  const text = new TextDecoder().decode(stderr) +
    new TextDecoder().decode(stdout);
  let made = 0;
  const merges: string[] = [];
  for (const m of text.matchAll(/instKey (made|merge) -> (\S+) x(\d+)$/gm)) {
    if (m[1] === "made") made += Number(m[3]);
    else for (let k = 0; k < Number(m[3]); k++) merges.push(m[2]);
  }
  return { code, made, merges: merges.sort() };
};

Deno.test({
  name:
    "canonical instance key: mono's partition, less only the instances it spells twice",
  ignore: !ENABLED,
  fn: async () => {
    const full = Deno.env.get("VL_INST_KEY_FULL") === "1";
    const list = full
      ? walk("tests/cases", []).sort()
      : [...Object.keys(MERGES), ...CONTROLS];
    const dir = await Deno.makeTempDir({ prefix: "vl_inst_key_" });
    try {
      const bad: string[] = [];
      let next = 0;
      const worker = async () => {
        while (next < list.length) {
          const i = next++;
          const rel = list[i];
          const { code, made, merges } = await sweep(rel, dir, i);
          const want = [...(MERGES[rel] ?? [])].sort();
          if (
            made === 0 && (!full || want.length > 0 || CONTROLS.includes(rel))
          ) {
            bad.push(
              `${rel}: no instKey report (exit ${code}), the shadow did not run`,
            );
            continue;
          }
          if (merges.join(",") !== want.join(",")) {
            bad.push(`${rel}: want merges [${want}], got [${merges}]`);
          }
        }
      };
      await Promise.all(Array.from({ length: POOL }, worker));
      if (bad.length) {
        throw new Error(
          `${bad.length} of ${list.length} programs:\n  ${bad.join("\n  ")}`,
        );
      }
    } finally {
      await Deno.remove(dir, { recursive: true });
    }
  },
});
