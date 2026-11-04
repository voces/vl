// AN INSTANCE'S NAMED-RECORD GUARD ENDS ITS BLOCK, AS ITS SPELLED-OUT TWIN DOES (D15257).
//
// In a generic instance, `if v is Cat { return 1 }` is decided at the pin. When it holds, the
// tail after the exiting arm is dead and lowers to `unreachable` (`monoStaticGuardEndsBlock`).
// Whether the guard is a record test is read from the pattern's own type (`isPatTyIx`), so
// `v is Cat` and `v is { m: i32 }` end their blocks alike. When it read the pattern's text,
// only the spelled shape did, and a named record lowered its dead tail. Both print the same, so
// this suite grades the lowering. A control whose guard is false at its pin keeps its tail.
//
// GATING: needs the built binary, the seed and `wasm-dis` (`node_modules/.bin`, not on PATH).
// `ci-native` installs no npm deps, so it self-ignores there; the `ci-release-shape` job names
// this file and runs it with npm deps.

import { binaryen, COMPILER, exists, nativeEnv, VL, wasmDis } from "./support/tree.ts";

const WASM_DIS = binaryen("wasm-dis");
const ENABLED = exists(VL) && exists(COMPILER) && exists(WASM_DIS);
if (!ENABLED) {
  console.warn("[named-record-guard-tail] skipped — missing vl, the seed or wasm-dis");
}

// Each function in a `wasm-dis` listing, by its `$name`, with its body text.
const functionsOf = (wat: string): Map<string, string> => {
  const out = new Map<string, string>();
  let name = "";
  let body: string[] = [];
  const flush = () => {
    if (name !== "") out.set(name, body.join("\n"));
  };
  for (const line of wat.split("\n")) {
    if (line.startsWith(" (")) {
      flush();
      const m = line.match(/^ \(func \$(\S+)/);
      name = m ? m[1] : "";
      body = [line];
    } else if (name !== "") {
      body.push(line);
    }
  }
  flush();
  return out;
};

// Builds `src` with names kept and disassembles it.
const disassemble = async (src: string): Promise<Map<string, string>> => {
  const dir = Deno.makeTempDirSync({ prefix: "vl-named-guard-" });
  try {
    const file = `${dir}/p.vl`;
    const out = `${dir}/p.wasm`;
    Deno.writeTextFileSync(file, src);
    const p = await new Deno.Command(VL, {
      args: ["build", file, "--names", "-o", out, "--compiler", COMPILER],
      env: nativeEnv(),
      stdout: "piped",
      stderr: "piped",
    }).output();
    if (!p.success) {
      const err = new TextDecoder().decode(p.stdout) +
        new TextDecoder().decode(p.stderr);
      throw new Error(`vl build failed: ${err}`);
    }
    const d = await wasmDis([out]);
    return functionsOf(new TextDecoder().decode(d.stdout));
  } finally {
    Deno.removeSync(dir, { recursive: true });
  }
};

// The body of the one function named `name`, or `name@…`.
const bodyOf = (fns: Map<string, string>, name: string): string => {
  const hits = [...fns.keys()].filter((n) => n === name || n.startsWith(`${name}@`));
  if (hits.length !== 1) {
    throw new Error(
      `want one function ${name}, got ${JSON.stringify(hits)} of ${
        JSON.stringify([...fns.keys()])
      }`,
    );
  }
  return fns.get(hits[0])!;
};

const PROGRAM = [
  "type Cat = { m: i32 }",
  "function named<T>(v: T): i32 {",
  "  if v is Cat { return 1 }",
  "  return 0",
  "}",
  "function spelled<T>(v: T): i32 {",
  "  if v is { m: i32 } { return 1 }",
  "  return 0",
  "}",
  "function live<T>(v: T): i32 {",
  "  if v is Cat { return 1 }",
  "  return 0",
  "}",
  "print(named({ m: 1 }))",
  "print(spelled({ m: 2 }))",
  "print(live(3))",
].join("\n");

const DEAD_TAIL = "(i32.const 0)";

Deno.test({
  name: "named-record-guard-tail: `v is Cat` true at its pin ends the block, as `v is { m: i32 }` does",
  ignore: !ENABLED,
  async fn() {
    const fns = await disassemble(PROGRAM);
    for (const fn of ["named", "spelled"]) {
      const body = bodyOf(fns, fn);
      if (!body.includes("(unreachable)") || body.includes(DEAD_TAIL)) {
        throw new Error(`${fn}: want the tail after the exiting arm to be unreachable, got:\n${body}`);
      }
    }
    // The control: false at its pin, so the tail is live.
    const live = bodyOf(fns, "live");
    if (!live.includes(DEAD_TAIL) || live.includes("(unreachable)")) {
      throw new Error(`live: want the tail kept (the control), got:\n${live}`);
    }
  },
});
