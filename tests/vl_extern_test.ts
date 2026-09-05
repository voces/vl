// `extern function` AGAINST THE NATIVE HOST — the three facts the corpus fixtures cannot
// assert, because a `tests/cases/` fixture is graded on its `@log` lines alone.
//
//   1. THE IMPORT SECTION IS THE MANIFEST. Two modules declaring one extern emit exactly
//      one `(import "extern" "nowMillis" …)`, and the entry is in the `extern` namespace,
//      not `imports` — the split a host uses to tell a user extern from a std intrinsic.
//   2. AN UNPROVIDED EXTERN IS A LOAD ERROR, exit 1, naming the function. That is the
//      enforcement half of the design; a fixture that ran it would just fail.
//   3. `vl check` NEEDS NO PROVIDER. The same program checks clean, because checking a
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
const WASM_DIS = `${ROOT}/node_modules/.bin/wasm-dis`;

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

Deno.test({
  name: "extern: two modules declaring one extern emit ONE import, in the `extern` namespace",
  ignore: !ENABLED,
  fn: async () => {
    if (!exists(WASM_DIS)) {
      throw new Error(
        `missing ${WASM_DIS} — binaryen is pinned in package.json; run \`npm install\``,
      );
    }
    const dir = await Deno.makeTempDir({ prefix: "vl_extern_dis_" });
    const out = `${dir}/entry.wasm`;
    try {
      const built = await vl(["build", `${CASES}/two-modules/entry.vl`, "-o", out]);
      if (built.code !== 0) {
        throw new Error(`\`vl build\` exited ${built.code}\n${built.err}`);
      }
      const dis = await new Deno.Command(WASM_DIS, {
        args: [out],
        stdout: "piped",
        stderr: "piped",
      }).output();
      const wat = new TextDecoder().decode(dis.stdout);
      const externs = wat.split("\n").filter((l) => l.includes('(import "extern" '));
      if (externs.length !== 1) {
        throw new Error(
          `want exactly 1 \`extern\` import, got ${externs.length}:\n${externs.join("\n")}`,
        );
      }
      if (!externs[0].includes('"nowMillis"') || !externs[0].includes("(result i64)")) {
        throw new Error(
          `the import entry does not carry the declared name and result: ${externs[0]}`,
        );
      }
      // The std intrinsics keep their own namespace, which is the point of the split.
      if (wat.includes('(import "extern" "__')) {
        throw new Error(`a std intrinsic leaked into the \`extern\` namespace:\n${wat}`);
      }
    } finally {
      await Deno.remove(dir, { recursive: true });
    }
  },
});

Deno.test({
  name: "extern: `export extern` in one module gives every importer ONE import, and no wasm export",
  ignore: !ENABLED,
  fn: async () => {
    if (!exists(WASM_DIS)) {
      throw new Error(
        `missing ${WASM_DIS} — binaryen is pinned in package.json; run \`npm install\``,
      );
    }
    const dir = await Deno.makeTempDir({ prefix: "vl_extern_exp_" });
    const out = `${dir}/entry.wasm`;
    try {
      const built = await vl([
        "build",
        `${CASES}/exported-from-host-module/entry.vl`,
        "-o",
        out,
      ]);
      if (built.code !== 0) {
        throw new Error(`\`vl build\` exited ${built.code}\n${built.err}`);
      }
      const dis = await new Deno.Command(WASM_DIS, {
        args: [out],
        stdout: "piped",
        stderr: "piped",
      }).output();
      const wat = new TextDecoder().decode(dis.stdout);
      const externs = wat.split("\n").filter((l) => l.includes('(import "extern" '));
      // Three declarations across four modules — two exported and taken by an importer each,
      // one module-private — so three imports, and not one more per importing module.
      const want = ["nowMillis", "hostEcho", "hostPrivate"];
      if (externs.length !== want.length) {
        throw new Error(
          `want ${want.length} \`extern\` imports, got ${externs.length}:\n${
            externs.join("\n")
          }`,
        );
      }
      for (const name of want) {
        if (!externs.some((l) => l.includes(`"${name}"`))) {
          throw new Error(`no import entry for \`${name}\`:\n${externs.join("\n")}`);
        }
      }
      // An `export extern` publishes a VL name, never a wasm one: an alias row would name a
      // local function the merge never defines.
      if (wat.includes("(export ")) {
        throw new Error(`an exported extern leaked into the wasm export section:\n${wat}`);
      }
    } finally {
      await Deno.remove(dir, { recursive: true });
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
