// Which compiler functions a corpus never runs. Instruments a `--names` seed with binaryen's
// `--log-execution` (a call at every function entry, loop and return), drives `compileSrc` over
// each program on the instrumented module, and lists the functions no id of theirs fired in.
//
//   vl build compiler/entry.vl --names -o /tmp/names.wasm
//   deno run -A scripts/fn-coverage.ts --names /tmp/names.wasm [--list <file>] [--matrix]
//     [--jobs 4] [--out <never.json>]
//
// The default population is every `.vl` under tests/, std/, scripts/ and bench/, plus
// compiler/entry.vl; `--matrix` adds every cell program the capability-matrix templates generate
// (`capability-matrix.vl --generate`), which the tree holds only as templates. A function this reports is one `compileSrc` never reached on that population,
// not a dead one: the CLI, lint, fmt, LSP and optimiser entries are not driven, and a refusal or an
// env-gated instrument never fires on a corpus that holds no emit reject.

const ROOT = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
const BIN = `${ROOT}/node_modules/.bin`;

type Exports = Record<string, (...a: number[]) => number>;

const arg = (name: string): string | undefined => {
  const i = Deno.args.indexOf(name);
  return i >= 0 ? Deno.args[i + 1] : undefined;
};

const run = async (cmd: string, args: string[]) => {
  const r = await new Deno.Command(cmd, { args, stderr: "inherit" }).output();
  if (!r.success) throw new Error(`${cmd} ${args.join(" ")} failed`);
};

const push = (fn: (c: number) => number, t: string) => {
  for (const ch of t) fn(ch.codePointAt(0)!);
};

const readStr = (len: number, at: (j: number) => number) => {
  const b = new Uint8Array(len);
  for (let j = 0; j < len; j++) b[j] = at(j);
  return new TextDecoder().decode(b);
};

const readOr = (paths: string[]): string => {
  for (const p of paths) {
    try {
      return Deno.readTextFileSync(p);
    } catch {
      // Try the next spelling of the key.
    }
  }
  return "";
};

// Worker mode: compile shard `shard` of `n` of the list, writing the ids that fired.
const worker = (
  wasm: string,
  list: string,
  shard: number,
  n: number,
  out: string,
) => {
  const mod = new WebAssembly.Module(Deno.readFileSync(wasm));
  const hit = new Uint8Array(1 << 20);
  const imports = {
    env: {
      log_execution: (i: number) => {
        hit[i] = 1;
      },
    },
  };
  const files = Deno.readTextFileSync(list).split("\n").filter((x, i) =>
    x !== "" && i % n === shard
  );
  let threw = 0;
  for (const f of files) {
    try {
      const exp = new WebAssembly.Instance(mod, imports)
        .exports as unknown as Exports;
      exp.modReset();
      const commit = (key: string, src: string) => {
        push(exp.modKeyPush, key);
        push(exp.modSrcPush, src);
        exp.modCommit(1);
      };
      const src = Deno.readTextFileSync(f);
      const dir = f.slice(0, f.lastIndexOf("/"));
      commit(f, src);
      for (let round = 0; round < 64 && exp.modPendingCount() > 0; round++) {
        const keys: string[] = [];
        for (let i = 0; i < exp.modPendingCount(); i++) {
          keys.push(
            readStr(exp.modPendingLen(i), (j) => exp.modPendingAt(i, j)),
          );
        }
        for (const k of keys) {
          commit(
            k,
            k.startsWith("std:")
              ? readOr([`${ROOT}/std/${k.slice(4)}.vl`])
              : readOr([k, `${k}.vl`, `${dir}/${k}`, `${dir}/${k}.vl`]),
          );
        }
      }
      exp.srcReset();
      push(exp.srcPush, src);
      exp.compileSrc();
    } catch {
      threw++;
    }
  }
  const ids: number[] = [];
  for (let i = 0; i < hit.length; i++) if (hit[i]) ids.push(i);
  Deno.writeTextFileSync(
    out,
    JSON.stringify({ files: files.length, threw, ids }),
  );
};

// The function each logged id sits in, from the instrumented module's text.
const idMap = (wat: string): { byId: Map<number, string>; fns: string[] } => {
  const byId = new Map<number, string>();
  const fns: string[] = [];
  let fn = "";
  let pending = false;
  for (const l of wat.split("\n")) {
    const f = /^ \(func (\$\S+)/.exec(l);
    if (f) {
      fn = f[1];
      fns.push(fn);
    } else if (l.includes("call $fimport$0")) {
      pending = true;
    } else if (pending) {
      const c = /i32\.const (\d+)/.exec(l);
      if (c) byId.set(+c[1], fn);
      pending = false;
    }
  }
  return { byId, fns };
};

const listCorpus = (): string[] => {
  const out: string[] = [];
  const walk = (d: string) => {
    for (const e of Deno.readDirSync(d)) {
      const p = `${d}/${e.name}`;
      if (e.isDirectory) walk(p);
      else if (e.name.endsWith(".vl")) out.push(p);
    }
  };
  for (const d of ["tests", "std", "scripts", "bench"]) walk(`${ROOT}/${d}`);
  out.push(`${ROOT}/compiler/entry.vl`);
  return out.sort();
};

// Every capability-matrix template's cell programs, generated under `dir`, `jobs` templates at a
// time; a template that fails to generate is counted, not fatal.
const matrixPrograms = async (dir: string, jobs: number): Promise<string[]> => {
  const tdir = `${ROOT}/scripts/capability-probes/matrix`;
  const tpls = [...Deno.readDirSync(tdir)]
    .map((e) => e.name)
    .filter((n) => n.endsWith(".matrix.vl"))
    .sort();
  const vl = `${ROOT}/scripts/vl-host/target/release/vl`;
  let next = 0;
  let failed = 0;
  const one = async () => {
    while (next < tpls.length) {
      const i = next++;
      const r = await new Deno.Command(vl, {
        args: [
          "run",
          `${ROOT}/scripts/capability-matrix.vl`,
          "--",
          `${tdir}/${tpls[i]}`,
          "--generate",
          "--out-dir",
          `${dir}/${i}`,
        ],
        cwd: ROOT,
        stdout: "null",
        stderr: "null",
      }).output();
      if (!r.success) failed++;
    }
  };
  await Promise.all([...Array(jobs).keys()].map(one));
  const out: string[] = [];
  for (let i = 0; i < tpls.length; i++) {
    try {
      for (const e of Deno.readDirSync(`${dir}/${i}`)) {
        if (e.name.endsWith(".vl")) out.push(`${dir}/${i}/${e.name}`);
      }
    } catch {
      // A template that wrote nothing.
    }
  }
  console.log(
    `matrix: ${tpls.length} templates, ${failed} failed to generate, ${out.length} programs`,
  );
  return out.sort();
};

const main = async () => {
  const shard = arg("--shard");
  if (shard !== undefined) {
    const [i, n] = shard.split("/").map(Number);
    worker(arg("--wasm")!, arg("--list")!, i, n, arg("--out")!);
    return;
  }
  const names = arg("--names");
  if (names === undefined) {
    throw new Error("usage: --names <seed built with --names>");
  }
  const jobs = Number(arg("--jobs") ?? "4");
  const tmp = await Deno.makeTempDir();
  try {
    const logged = `${tmp}/logged.wasm`;
    // Custom descriptors off: V8 does not load the exact heap types binaryen writes with them.
    await run(`${BIN}/wasm-opt`, [
      names,
      "-g",
      "--all-features",
      "--disable-custom-descriptors",
      "--log-execution",
      "-o",
      logged,
    ]);
    await run(`${BIN}/wasm-dis`, [logged, "-o", `${tmp}/logged.wat`]);
    const { byId, fns } = idMap(Deno.readTextFileSync(`${tmp}/logged.wat`));
    await Deno.remove(`${tmp}/logged.wat`);
    const list = arg("--list") ?? `${tmp}/list.txt`;
    if (arg("--list") === undefined) {
      const progs = listCorpus();
      if (Deno.args.includes("--matrix")) {
        progs.push(...await matrixPrograms(`${tmp}/matrix`, jobs));
      }
      Deno.writeTextFileSync(list, progs.join("\n") + "\n");
    }
    const self = new URL(import.meta.url).pathname;
    await Promise.all([...Array(jobs).keys()].map((i) =>
      run(Deno.execPath(), [
        "run",
        "-A",
        self,
        "--shard",
        `${i}/${jobs}`,
        "--wasm",
        logged,
        "--list",
        list,
        "--out",
        `${tmp}/ids-${i}.json`,
      ])
    ));
    const ran = new Set<string>();
    let files = 0;
    let threw = 0;
    for (let i = 0; i < jobs; i++) {
      const r = JSON.parse(Deno.readTextFileSync(`${tmp}/ids-${i}.json`));
      files += r.files;
      threw += r.threw;
      for (const id of r.ids) {
        const f = byId.get(id);
        if (f !== undefined) ran.add(f);
      }
    }
    const logged_ = new Set(byId.values());
    const never = fns.filter((f) => logged_.has(f) && !ran.has(f));
    const byMod = new Map<string, number>();
    for (const f of never) {
      const m = /@([\w./]+\.vl):\d+$/.exec(f)?.[1] ?? "(unnamed)";
      byMod.set(m, (byMod.get(m) ?? 0) + 1);
    }
    console.log(
      `${files} programs (${threw} threw); ${fns.length} functions, ${ran.size} ran, ${never.length} never`,
    );
    for (const [m, c] of [...byMod].sort((a, b) => b[1] - a[1])) {
      console.log(`${c}\t${m}`);
    }
    const out = arg("--out");
    if (out !== undefined) {
      Deno.writeTextFileSync(out, JSON.stringify(never, null, 1) + "\n");
    }
  } finally {
    await Deno.remove(tmp, { recursive: true });
  }
};

await main();
