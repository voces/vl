// A FUNCTION SET THAT NEEDS NO DISPATCH KEEPS THE CLOSURE REPRESENTATION — D3975.
//
// A set of un-annotated functions is lowered to an i32 member id only when a call through it
// dispatches on which member it holds. A set that is delivered to a declared function type,
// stored in a list, or only ever called at one type must cost exactly what it did before the
// id lowering existed. This pins that by building each such program against the same program
// with the selector's result annotated as a function type, which forces the closure, and
// requiring the two modules to be BYTE-IDENTICAL and to call through the table. A program that
// does dispatch is the control: it must make no indirect call, or the check is not seeing the
// lowering.
//
// GATING: needs the built binary, the seed and binaryen (`node_modules`). A missing
// prerequisite self-ignores rather than fails, so read the suite's IGNORED COUNT.
//
// @test-timing native

import { binaryen, COMPILER, exists, nativeEnv, VL, wasmDis } from "./support/tree.ts";

const ENABLED = exists(VL) && exists(COMPILER) && exists(binaryen("wasm-dis"));
if (!ENABLED) console.warn("[fn-set-rep] skipped — missing vl, the seed or binaryen");

const MEMBERS = [
  "function inc(a) { return a + 1 }",
  "function dbl(a) { return a * 2 }",
];
const sel = (annotated: boolean) => [
  annotated ? "function sel(c: boolean): (a: i32) => i32 {" : "function sel(c: boolean) {",
  "  if c { return inc }",
  "  return dbl",
  "}",
];

// Each body is spelled twice, with `sel` un-annotated and annotated.
const BODIES: Record<string, string[]> = {
  deliveredToDeclared: [
    "function ap(f: (x: i32) => i32, x: i32) { return f(x) }",
    "print(ap(sel(false), 3))",
  ],
  storedInList: [
    "const fs = [sel(true), sel(false)]",
    "print(fs[0](3))",
    "print(fs[1](3))",
  ],
  calledAtOneType: ["const g = sel(false)", "print(g(3))"],
};
// Called at two types, so only the un-annotated spelling type-checks.
const CONTROL = ["const g = sel(false)", "print(g(3))", "print(g(2.5))"];

const build = async (dir: string, name: string, lines: string[]): Promise<Uint8Array> => {
  const src = `${dir}/${name}.vl`;
  const out = `${dir}/${name}.wasm`;
  Deno.writeTextFileSync(src, lines.join("\n") + "\n");
  const p = await new Deno.Command(VL, {
    args: ["build", src, "-o", out, "--compiler", COMPILER],
    env: nativeEnv(),
    stdout: "piped",
    stderr: "piped",
  }).output();
  if (!p.success) {
    throw new Error(`vl build ${name} failed: ${new TextDecoder().decode(p.stderr)}`);
  }
  return Deno.readFileSync(out);
};

const indirectCalls = async (dir: string, name: string): Promise<number> => {
  const p = await wasmDis([`${dir}/${name}.wasm`]);
  if (!p.success) throw new Error(`wasm-dis ${name} failed`);
  return new TextDecoder().decode(p.stdout).split(/call_indirect|call_ref/).length - 1;
};

const sameBytes = (a: Uint8Array, b: Uint8Array): boolean =>
  a.length === b.length && a.every((x, i) => x === b[i]);

Deno.test({
  name: "fn-set rep: a set with no dispatching call is the closure its annotation forces",
  ignore: !ENABLED,
  fn: async () => {
    const dir = Deno.makeTempDirSync({ prefix: "vl-fn-set-rep-" });
    try {
      for (const [name, body] of Object.entries(BODIES)) {
        const bare = await build(dir, name, [...MEMBERS, ...sel(false), ...body]);
        const ann = await build(dir, name + "Ann", [...MEMBERS, ...sel(true), ...body]);
        if (!sameBytes(bare, ann)) {
          throw new Error(
            `${name}: want byte-identical modules, got ${bare.length} bytes against the ` +
              `annotated spelling's ${ann.length}`,
          );
        }
        if (await indirectCalls(dir, name) === 0) {
          throw new Error(`${name}: want a call through the closure, got no indirect call`);
        }
      }
      await build(dir, "control", [...MEMBERS, ...sel(false), ...CONTROL]);
      const n = await indirectCalls(dir, "control");
      if (n !== 0) throw new Error(`control: want a dispatch with no indirect call, got ${n}`);
    } finally {
      Deno.removeSync(dir, { recursive: true });
    }
  },
});
