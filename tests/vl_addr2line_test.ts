// `vl build --source-map` + `vl addr2line`: a trap's byte offset maps to the LINE that
// trapped, through -O/-O3 (D3561, sunpa SP-010).
//
// A `--names` frame reads `pick@2`, the line `pick` is DECLARED on. The build writes a
// source map v3 beside the module (one generated line, each column a MODULE byte offset),
// threads it through every `wasm-opt` run, and names it in a `sourceMappingURL` section;
// `vl addr2line` reads it back. Each case traps a module under Deno's own V8, takes the
// `wasm-function[i]:0xOFF` the engine printed, and asks addr2line for the line, so what is
// pinned is the offset an engine really reports, not one this test computed.
//
// Cases: sunpa's witness at every rung, a 300-line function trapping deep inside, a callee
// inlined at -O3 (binaryen keeps the CALLEE's line, the ideal), a pasted trace on stdin, and
// a build without the flag writing neither the map nor the section.
//
// GATING: as the `selfhost_native_release*` suites (`SELFHOST_NATIVE_ALIGN=1`, the binary,
// the seed and binaryen).
import {
  COMPILER,
  ENABLED,
  nativeEnv,
  ROOT,
  VL,
  WASM_OPT,
} from "./support/nativeRelease.ts";

// Real paths: the map names its sources relative to itself, which addr2line resolves.
const DIR = ENABLED
  ? Deno.realPathSync(`${ROOT}/tests/fixtures/source-map`)
  : "";

const run = async (args: string[], stdin?: string) => {
  const p = new Deno.Command(VL, {
    args,
    stdin: stdin === undefined ? "null" : "piped",
    stdout: "piped",
    stderr: "piped",
    env: nativeEnv({ VL_WASM_OPT: WASM_OPT }),
  }).spawn();
  if (stdin !== undefined) {
    const w = p.stdin.getWriter();
    await w.write(new TextEncoder().encode(stdin));
    await w.close();
  }
  const { code, stdout, stderr } = await p.output();
  const dec = new TextDecoder();
  return { code, out: dec.decode(stdout), err: dec.decode(stderr) };
};

const build = async (src: string, out: string, flags: string[]) => {
  const r = await run([
    "build",
    src,
    "--compiler",
    COMPILER,
    "-o",
    out,
    ...flags,
  ]);
  if (r.code !== 0) {
    throw new Error(
      `vl build ${src} ${
        flags.join(" ")
      } failed (rc ${r.code}): ${r.err.trim()}`,
    );
  }
};

/** Call `fn(arg)` on the module, which must trap; the engine's stack trace. */
const trapTrace = async (
  wasm: string,
  fn: string,
  arg: number,
): Promise<string> => {
  // Every import is stubbed: the cases trap before an import's answer could matter.
  const module = new WebAssembly.Module(Deno.readFileSync(wasm));
  const imports: Record<string, Record<string, () => number>> = {};
  for (const i of WebAssembly.Module.imports(module)) {
    (imports[i.module] ??= {})[i.name] = () => 0;
  }
  const instance = await WebAssembly.instantiate(module, imports);
  try {
    const got = (instance.exports[fn] as (n: number) => number)(arg);
    throw new Error(`${wasm}: ${fn}(${arg}) returned ${got}, want a trap`);
  } catch (e) {
    if (!(e instanceof WebAssembly.RuntimeError)) throw e;
    return e.stack ?? "";
  }
};

/** The first `wasm-function[i]:0xOFF` in a trace — the frame that trapped. */
const topFrame = (trace: string): string => {
  const m = trace.match(/wasm-function\[\d+\]:0x[0-9a-f]+/);
  if (!m) throw new Error(`no wasm frame in the trace:\n${trace}`);
  return m[0];
};

const customSections = (wasm: string): string[] =>
  sectionNames(Deno.readFileSync(wasm));

/** `b` without its custom section `name`. */
function withoutSection(b: Uint8Array, name: string): Uint8Array {
  const keep: number[] = [...b.subarray(0, 8)];
  let i = 8;
  const uleb = () => {
    let v = 0, s = 0;
    for (;;) {
      const x = b[i++];
      v |= (x & 0x7f) << s;
      s += 7;
      if (x < 0x80) return v >>> 0;
    }
  };
  while (i < b.length) {
    const start = i;
    const id = b[i++];
    const n = uleb();
    const end = i + n;
    let drop = false;
    if (id === 0) {
      const l = uleb();
      drop = new TextDecoder().decode(b.subarray(i, i + l)) === name;
    }
    if (!drop) keep.push(...b.subarray(start, end));
    i = end;
  }
  return new Uint8Array(keep);
}

function sectionNames(b: Uint8Array): string[] {
  const names: string[] = [];
  let i = 8;
  const uleb = () => {
    let v = 0, s = 0;
    for (;;) {
      const x = b[i++];
      v |= (x & 0x7f) << s;
      s += 7;
      if (x < 0x80) return v >>> 0;
    }
  };
  while (i < b.length) {
    const id = b[i++];
    const n = uleb();
    const end = i + n;
    if (id === 0) {
      const l = uleb();
      names.push(new TextDecoder().decode(b.subarray(i, i + l)));
    }
    i = end;
  }
  return names;
}

const addr2line = async (wasm: string, loc: string) => {
  const r = await run(["addr2line", wasm, loc]);
  if (r.code !== 0) {
    throw new Error(
      `vl addr2line ${wasm} ${loc} failed (rc ${r.code}): ${r.out}${r.err}`,
    );
  }
  return r.out.trim();
};

const expectLine = (got: string, want: string, what: string) => {
  if (!got.startsWith(want)) {
    throw new Error(`${what}: want \`${want}…\`, got \`${got}\``);
  }
};

// A trap inside a producer whose record the caller only reads: at -O/-O3 the call goes to
// the multi-value step's twin, and the step moved the code the map names, so the map was
// made again from the moved rows (D3625). The step leaves its output only when it rewrote the
// module, so the dump's presence is what says there was a twin to trap in.
for (const flags of [["-O"], ["-O3"], ["-O3", "--names"]]) {
  Deno.test({
    name: `vl addr2line: a trap in a multi-value twin keeps its line [${
      flags.join(" ")
    }]`,
    ignore: !ENABLED,
    fn: async () => {
      const tmp = await Deno.makeTempDir();
      try {
        const wasm = `${tmp}/record.wasm`;
        const dump = `${tmp}/step.wasm`;
        const r = await new Deno.Command(VL, {
          args: [
            "build",
            `${DIR}/record.vl`,
            "--compiler",
            COMPILER,
            "-o",
            wasm,
            ...flags,
            "--source-map",
          ],
          stdout: "piped",
          stderr: "piped",
          env: nativeEnv({ VL_WASM_OPT: WASM_OPT, VL_OPT_MV_DUMP: dump }),
        }).output();
        if (r.code !== 0) {
          throw new Error(`build: ${new TextDecoder().decode(r.stderr)}`);
        }
        try {
          Deno.statSync(dump);
        } catch {
          throw new Error(
            "the multi-value step changed nothing: no twin to trap in",
          );
        }
        const frame = topFrame(await trapTrace(wasm, "pick", 7));
        expectLine(
          await addr2line(wasm, frame),
          `${DIR}/record.vl:4:`,
          frame,
        );
      } finally {
        await Deno.remove(tmp, { recursive: true });
      }
    },
  });
}

for (const flags of [[], ["-O"], ["-O3"], ["--names"], ["-O3", "--names"]]) {
  Deno.test({
    name: `vl addr2line: sunpa's witness traps on line 5 [${
      flags.join(" ") || "plain"
    }]`,
    ignore: !ENABLED,
    fn: async () => {
      const tmp = await Deno.makeTempDir();
      try {
        const wasm = `${tmp}/pick.wasm`;
        await build(`${DIR}/pick.vl`, wasm, [...flags, "--source-map"]);
        const sections = customSections(wasm);
        if (!sections.includes("sourceMappingURL")) {
          throw new Error(
            `no sourceMappingURL section; sections: ${sections.join(", ")}`,
          );
        }
        if (sections.includes("name") !== flags.includes("--names")) {
          throw new Error(
            `a name section exactly when --names is given; got ${
              sections.join(", ")
            }`,
          );
        }
        const frame = topFrame(await trapTrace(wasm, "pick", 7));
        const got = await addr2line(wasm, frame);
        expectLine(got, `${DIR}/pick.vl:5:7`, `${frame}`);
        // An unnamed function gets no label (see the imports case).
        const want = flags.includes("--names") ? "  in `pick`" : "5:7";
        if (!got.endsWith(want)) {
          throw new Error(`want the answer to end \`${want}\`, got \`${got}\``);
        }
      } finally {
        await Deno.remove(tmp, { recursive: true });
      }
    },
  });
}

Deno.test({
  name:
    "vl addr2line: a 300-line function names the line deep inside it at -O3",
  ignore: !ENABLED,
  fn: async () => {
    const tmp = await Deno.makeTempDir();
    try {
      const trapAt = 251;
      const lines = [
        "const xs = [1, 2, 3]",
        "export function big(i: i32): i32 {",
        "  let s = i",
      ];
      while (lines.length < 302) {
        const n = lines.length + 1;
        lines.push(
          n === trapAt
            ? "  s = s + xs[i]"
            : `  s = (s * ${n % 7 + 2} + ${n}) % 1000003`,
        );
      }
      lines.push("  s", "}");
      Deno.writeTextFileSync(`${tmp}/big.vl`, lines.join("\n") + "\n");
      const wasm = `${tmp}/big.wasm`;
      await build(`${tmp}/big.vl`, wasm, ["-O3", "--names", "--source-map"]);
      const trace = await trapTrace(wasm, "big", 7);
      if (!trace.includes("big@2")) {
        throw new Error(
          `the name section's frame is the declaration's:\n${trace}`,
        );
      }
      expectLine(
        await addr2line(wasm, topFrame(trace)),
        `${Deno.realPathSync(tmp)}/big.vl:${trapAt}:11`,
        "300-line body",
      );
    } finally {
      await Deno.remove(tmp, { recursive: true });
    }
  },
});

Deno.test({
  name: "vl addr2line: a callee inlined at -O3 keeps the callee's line",
  ignore: !ENABLED,
  fn: async () => {
    const tmp = await Deno.makeTempDir();
    try {
      const wasm = `${tmp}/main.wasm`;
      await build(`${DIR}/inline/main.vl`, wasm, [
        "-O3",
        "--names",
        "--source-map",
      ]);
      const trace = await trapTrace(wasm, "outer", 9);
      // Inlined: the engine reports one frame, the caller's.
      if (trace.includes("grab")) {
        throw new Error(`want \`grab\` inlined into \`outer\`:\n${trace}`);
      }
      const got = await addr2line(wasm, topFrame(trace));
      expectLine(got, `${DIR}/inline/helper.vl:6:3`, "inlined callee");
      if (!got.endsWith("in `outer$m0`")) {
        throw new Error(`want the caller's frame named, got \`${got}\``);
      }
    } finally {
      await Deno.remove(tmp, { recursive: true });
    }
  },
});

Deno.test({
  name: "vl addr2line: `-` annotates a pasted stack trace frame by frame",
  ignore: !ENABLED,
  fn: async () => {
    const tmp = await Deno.makeTempDir();
    try {
      const wasm = `${tmp}/main.wasm`;
      await build(`${DIR}/inline/main.vl`, wasm, ["--names", "--source-map"]);
      const trace = await trapTrace(wasm, "outer", 9);
      const r = await run(["addr2line", wasm, "-"], trace);
      const marks = r.out.split("\n").filter((l) => l.startsWith("    => "));
      const want = [
        "    => " + `${DIR}/inline/helper.vl:6:3` + "  in `grab$m1`",
        "    => " + `${DIR}/inline/main.vl:5:3` + "  in `outer$m0`",
      ];
      if (r.code !== 0 || JSON.stringify(marks) !== JSON.stringify(want)) {
        throw new Error(
          `rc ${r.code}; want ${JSON.stringify(want)}, got:\n${r.out}${r.err}`,
        );
      }
    } finally {
      await Deno.remove(tmp, { recursive: true });
    }
  },
});

Deno.test({
  name:
    "vl build: without --source-map, no map is written and no section is added",
  ignore: !ENABLED,
  fn: async () => {
    const tmp = await Deno.makeTempDir();
    try {
      for (const flags of [[], ["-O3"], ["-O3", "--names"]]) {
        const wasm = `${tmp}/pick.wasm`;
        await build(`${DIR}/pick.vl`, wasm, flags);
        const sections = customSections(wasm);
        let mapped = true;
        try {
          Deno.statSync(`${wasm}.map`);
        } catch {
          mapped = false;
        }
        if (mapped || sections.includes("sourceMappingURL")) {
          throw new Error(
            `[${flags.join(" ")}] wrote a map or a sourceMappingURL: ${
              sections.join(", ")
            }`,
          );
        }
      }
      // The map is a side channel: binaryen's code is the same with it, only the section added.
      const plain = Deno.readFileSync(`${tmp}/pick.wasm`);
      await build(`${DIR}/pick.vl`, `${tmp}/mapped.wasm`, [
        "-O3",
        "--names",
        "--source-map",
      ]);
      const mapped = withoutSection(
        Deno.readFileSync(`${tmp}/mapped.wasm`),
        "sourceMappingURL",
      );
      if (
        plain.length !== mapped.length || plain.some((b, i) => b !== mapped[i])
      ) {
        throw new Error(
          `-O3 --names with and without --source-map differ beyond the section`,
        );
      }
      const r = await run([
        "build",
        `${DIR}/pick.vl`,
        "--source-map",
        "-o",
        "-",
      ]);
      if (r.code !== 2 || !r.err.includes("--source-map")) {
        throw new Error(
          `\`--source-map -o -\` must refuse (rc 2), got rc ${r.code}: ${r.err}`,
        );
      }
    } finally {
      await Deno.remove(tmp, { recursive: true });
    }
  },
});

Deno.test({
  name:
    "vl addr2line: an offset in no function body has no answer (rc 1), never the last line",
  ignore: !ENABLED,
  fn: async () => {
    const tmp = await Deno.makeTempDir();
    try {
      const wasm = `${tmp}/pick.wasm`;
      await build(`${DIR}/pick.vl`, wasm, ["-O3", "--names", "--source-map"]);
      const size = Deno.statSync(wasm).size;
      // The type section, the module's last byte (inside a custom section), and past the end.
      for (const loc of ["0xa", `${size - 1}`, "999999999"]) {
        const r = await run(["addr2line", wasm, loc]);
        if (r.code !== 1 || !r.out.startsWith("??")) {
          throw new Error(
            `${loc}: want \`??\` and rc 1, got rc ${r.code}: ${r.out}${r.err}`,
          );
        }
      }
    } finally {
      await Deno.remove(tmp, { recursive: true });
    }
  },
});

Deno.test({
  name:
    "vl addr2line: an unnamed function in a module with imports gets no index label",
  ignore: !ENABLED,
  fn: async () => {
    const tmp = await Deno.makeTempDir();
    try {
      const wasm = `${tmp}/imports.wasm`;
      await build(`${DIR}/imports.vl`, wasm, ["--source-map"]);
      const nImports = WebAssembly.Module.imports(
        new WebAssembly.Module(Deno.readFileSync(wasm)),
      ).filter((i) => i.kind === "function").length;
      if (nImports === 0) {
        throw new Error("the fixture must import a function to test this");
      }
      const frame = topFrame(await trapTrace(wasm, "boom", 7));
      // V8 13.6 (Node 24) counts imported functions in `wasm-function[i]` and V8 15 (Deno
      // 2.9) does not, so any index addr2line printed would be wrong under one of them.
      const got = await addr2line(wasm, frame);
      if (got !== `${DIR}/imports.vl:4:3`) {
        throw new Error(
          `want \`${DIR}/imports.vl:4:3\` and no label, got \`${got}\``,
        );
      }
    } finally {
      await Deno.remove(tmp, { recursive: true });
    }
  },
});

Deno.test({
  name:
    "vl addr2line: the `vl-src` fallback names the entry file, and stdin need not be UTF-8",
  ignore: !ENABLED,
  fn: async () => {
    const tmp = Deno.realPathSync(await Deno.makeTempDir());
    try {
      Deno.copyFileSync(`${DIR}/pick.vl`, `${tmp}/pick.vl`);
      const wasm = `${tmp}/pick.wasm`;
      await build(`${tmp}/pick.vl`, wasm, ["--names"]);
      const frame = topFrame(await trapTrace(wasm, "pick", 7));
      expectLine(
        await addr2line(wasm, frame),
        `${tmp}/pick.vl:5:7`,
        "vl-src fallback",
      );
      const p = new Deno.Command(VL, {
        args: ["addr2line", wasm, "-"],
        stdin: "piped",
        stdout: "piped",
        env: nativeEnv(),
      }).spawn();
      const w = p.stdin.getWriter();
      await w.write(new Uint8Array([0x6a, 0xff, 0xfe, 0x0a]));
      await w.write(new TextEncoder().encode(`    at (${frame})\n`));
      await w.close();
      const r = await p.output();
      const out = new TextDecoder().decode(r.stdout);
      if (r.code !== 0 || !out.includes(`=> ${tmp}/pick.vl:5:7`)) {
        throw new Error(`non-UTF-8 stdin: rc ${r.code}, got:\n${out}`);
      }
    } finally {
      await Deno.remove(tmp, { recursive: true });
    }
  },
});
