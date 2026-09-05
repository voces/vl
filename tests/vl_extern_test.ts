// `extern function` AGAINST THE NATIVE HOST — the facts the corpus fixtures cannot assert,
// because a `tests/cases/` fixture is graded on its `@log` lines alone.
//
//   1. THE IMPORT SECTION IS THE MANIFEST. Declarations fold to one import per NAME, in the
//      `extern` namespace and not `imports` — the split a host uses to tell a user extern
//      from a std intrinsic. Read through `WebAssembly.Module.imports` (see `sections`).
//   2. AN `export extern` PUBLISHES A VL NAME, NEVER A WASM ONE — the export section of a
//      module whose only export is an extern is empty.
//   3. A MODULE-PRIVATE EXTERN is unreachable from another module, by either route.
//   4. AN UNPROVIDED EXTERN IS A LOAD ERROR, exit 1, naming the function. That is the
//      enforcement half of the design; a fixture that ran it would just fail.
//   5. `vl check` NEEDS NO PROVIDER. The same program checks clean, because checking a
//      program never instantiates it.
//
// The `vl_` prefix is load-bearing: it is one of the globs `ci-native` auto-discovers
// (tests/ci_seed_coverage_test.ts). GATING is the usual one — `SELFHOST_NATIVE_ALIGN=1`
// plus a built binary and seed, so a fresh clone self-ignores.

const exists = (p: string): boolean => {
  try {
    Deno.statSync(p);
    return true;
  } catch {
    return false;
  }
};

const ROOT = new URL("../", import.meta.url).pathname.replace(/\/$/, "");
const VL = `${ROOT}/scripts/vl-host/target/release/vl`;
const COMPILER = `${ROOT}/build/vl-compiler.wasm`;
const STD = `${ROOT}/std`;
const CASES = `${ROOT}/tests/cases/extern`;

const GATED = Deno.env.get("SELFHOST_NATIVE_ALIGN") === "1";
const ENABLED = GATED && exists(VL) && exists(COMPILER);
if (GATED && !ENABLED) {
  console.warn("[vl-extern] skipped — missing vl binary or seed wasm.");
}

type Ran = { code: number; out: string; err: string };

/** Run `vl <args>` with `VL_STD` pinned to THIS tree (a worktree's binary is shared). */
const vl = async (args: string[]): Promise<Ran> => {
  const { code, stdout, stderr } = await new Deno.Command(VL, {
    args: [...args, "--compiler", COMPILER],
    stdout: "piped",
    stderr: "piped",
    env: { RUST_BACKTRACE: "0", NO_COLOR: "1", VL_STD: STD },
  }).output();
  const dec = new TextDecoder();
  return { code, out: dec.decode(stdout), err: dec.decode(stderr) };
};

const tmp = async (name: string, src: string): Promise<string> => {
  const dir = await Deno.makeTempDir({ prefix: "vl_extern_" });
  const p = `${dir}/${name}`;
  await Deno.writeTextFile(p, src);
  return p;
};

type Sections = {
  externs: WebAssembly.ModuleImportDescriptor[];
  imports: WebAssembly.ModuleImportDescriptor[];
  exports: WebAssembly.ModuleExportDescriptor[];
};

/**
 * Build `entry` and read its import/export sections through `WebAssembly.Module`.
 *
 * The engine is the reader, deliberately: `ci-native` installs no npm packages, so
 * `node_modules/.bin/wasm-dis` exists on a developer box and nowhere else — a suite that
 * shells out to it is green here and red in CI. `WebAssembly.Module.imports` /
 * `.exports` need no toolchain, and V8 parses this module's WasmGC types already (the
 * corpus oracle instantiates them), so compiling it is also a validity check.
 */
const sections = async (entry: string): Promise<Sections> => {
  const dir = await Deno.makeTempDir({ prefix: "vl_extern_sect_" });
  const out = `${dir}/entry.wasm`;
  try {
    const built = await vl(["build", entry, "-o", out]);
    if (built.code !== 0) {
      throw new Error(`\`vl build ${entry}\` exited ${built.code}\n${built.err}`);
    }
    const mod = new WebAssembly.Module(await Deno.readFile(out));
    const imports = WebAssembly.Module.imports(mod);
    return {
      imports,
      externs: imports.filter((i) => i.module === "extern"),
      exports: WebAssembly.Module.exports(mod),
    };
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
};

/** `module.name (kind)` per entry, for a failure message that names what it found. */
const show = (xs: WebAssembly.ModuleImportDescriptor[]): string =>
  xs.map((i) => `${i.module}.${i.name} (${i.kind})`).join(", ");

Deno.test({
  name: "extern: two modules declaring one extern emit ONE import, in the `extern` namespace",
  ignore: !ENABLED,
  fn: async () => {
    const s = await sections(`${CASES}/two-modules/entry.vl`);
    if (s.externs.length !== 1) {
      throw new Error(
        `want exactly 1 \`extern\` import, got ${s.externs.length}: ${show(s.externs)}`,
      );
    }
    if (s.externs[0].name !== "nowMillis" || s.externs[0].kind !== "function") {
      throw new Error(
        `want \`extern.nowMillis (function)\`, got ${show(s.externs)}`,
      );
    }
    // The std intrinsics keep their own namespace, which is the point of the split. The
    // fs floor and the print family are `imports`, and nothing dunder is an `extern`.
    const leaked = s.externs.filter((i) => i.name.startsWith("__"));
    if (leaked.length > 0) {
      throw new Error(`a std intrinsic leaked into \`extern\`: ${show(leaked)}`);
    }
    if (!s.imports.some((i) => i.module === "imports" && i.name === "__print_i64__")) {
      throw new Error(
        `\`__print_i64__\` is missing, so the extern's i64 result was not seen by the ` +
          `print-import scan: ${show(s.imports)}`,
      );
    }
  },
});

Deno.test({
  name: "extern: `export extern` in one module gives every importer ONE import, and no wasm export",
  ignore: !ENABLED,
  fn: async () => {
    const s = await sections(`${CASES}/exported-from-host-module/entry.vl`);
    // Three declarations across four modules — two exported and taken by an importer each,
    // one module-private — so three imports, and not one more per importing module.
    const want = ["nowMillis", "hostEcho", "hostPrivate"];
    if (s.externs.length !== want.length) {
      throw new Error(
        `want ${want.length} \`extern\` imports, got ${s.externs.length}: ${show(s.externs)}`,
      );
    }
    for (const name of want) {
      if (!s.externs.some((i) => i.name === name && i.kind === "function")) {
        throw new Error(`no \`extern.${name} (function)\` entry: ${show(s.externs)}`);
      }
    }
    // An `export extern` publishes a VL name, never a wasm one: an alias row would name a
    // local function the merge never defines, so the export section stays empty.
    if (s.exports.length !== 0) {
      throw new Error(
        `an exported extern leaked into the wasm export section: ${
          s.exports.map((e) => `${e.name} (${e.kind})`).join(", ")
        }`,
      );
    }
  },
});

Deno.test({
  name: "extern: a module-private extern is unreachable from another module",
  ignore: !ENABLED,
  fn: async () => {
    const dir = await Deno.makeTempDir({ prefix: "vl_extern_priv_" });
    try {
      await Deno.writeTextFile(
        `${dir}/host.vl`,
        "extern function hostPrivate(x: i32): i32\n" +
          "export function twice(x: i32) { return hostPrivate(x) }\n",
      );
      // Spelling it directly: the merge mangled the declaration, so the name is not in scope.
      await Deno.writeTextFile(
        `${dir}/spell.vl`,
        'import { twice } from "./host"\nprint(twice(1) + hostPrivate(2))\n',
      );
      const spelled = await vl(["check", `${dir}/spell.vl`]);
      if (spelled.code === 0 || !spelled.err.includes("undeclared identifier 'hostPrivate'")) {
        throw new Error(
          `want \`undeclared identifier 'hostPrivate'\`, got rc ${spelled.code}\n` +
            `${spelled.out}${spelled.err}`,
        );
      }
      // Importing it: the module does not export the name, so the import resolution says so.
      await Deno.writeTextFile(
        `${dir}/imp.vl`,
        'import { hostPrivate } from "./host"\nprint(hostPrivate(2))\n',
      );
      const imported = await vl(["check", `${dir}/imp.vl`]);
      if (
        imported.code === 0 ||
        !imported.err.includes('"hostPrivate" is not exported by "./host"')
      ) {
        throw new Error(
          `want \`"hostPrivate" is not exported by "./host"\`, got rc ${imported.code}\n` +
            `${imported.out}${imported.err}`,
        );
      }
    } finally {
      await Deno.remove(dir, { recursive: true });
    }
  },
});

Deno.test({
  name: "extern: an unprovided extern is a load error naming the function, exit 1",
  ignore: !ENABLED,
  fn: async () => {
    const p = await tmp(
      "unprovided.vl",
      "extern function frobnicate(x: i32): i32\nprint(frobnicate(1))\n",
    );
    try {
      const ran = await vl(["run", p]);
      if (ran.code !== 1) {
        throw new Error(
          `want exit 1 (the program failed to load), got ${ran.code}\n${ran.err}`,
        );
      }
      const want = "extern function `frobnicate` is declared but this host does not provide it";
      if (!ran.err.includes(want)) {
        throw new Error(`want stderr to contain:\n  ${want}\ngot:\n${ran.err}`);
      }
    } finally {
      await Deno.remove(p.replace(/\/[^/]+$/, ""), { recursive: true });
    }
  },
});

Deno.test({
  name: "extern: `vl check` needs no provider — the same program checks clean",
  ignore: !ENABLED,
  fn: async () => {
    const p = await tmp(
      "unprovided.vl",
      "extern function frobnicate(x: i32): i32\nprint(frobnicate(1))\n",
    );
    try {
      const ran = await vl(["check", p]);
      if (ran.code !== 0) {
        throw new Error(
          `want exit 0 — checking a program never instantiates it — got ${ran.code}\n` +
            `${ran.out}${ran.err}`,
        );
      }
    } finally {
      await Deno.remove(p.replace(/\/[^/]+$/, ""), { recursive: true });
    }
  },
});

Deno.test({
  name: "extern: a declared signature the host does not implement is refused by name",
  ignore: !ENABLED,
  fn: async () => {
    // The registry entry exists; the DECLARATION disagrees with it. wasmtime would refuse
    // this too, with a message naming neither the function nor the two signatures.
    const p = await tmp(
      "wrongsig.vl",
      "extern function nowMillis(): i32\nprint(nowMillis())\n",
    );
    try {
      const ran = await vl(["run", p]);
      if (ran.code !== 1) {
        throw new Error(`want exit 1, got ${ran.code}\n${ran.err}`);
      }
      if (!ran.err.includes("extern function `nowMillis` is declared")) {
        throw new Error(`want a signature refusal naming nowMillis, got:\n${ran.err}`);
      }
    } finally {
      await Deno.remove(p.replace(/\/[^/]+$/, ""), { recursive: true });
    }
  },
});
