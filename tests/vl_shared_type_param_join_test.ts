// ONE TYPE PARAMETER HANDED TWO GENERIC FUNCTIONS IS ONE INSTANCE IN EITHER ORDER (D15409).
//
// `one<F>(a: F, c: F)` handed two generic functions binds `F` to the union of their sets, and a
// member's id is its declaration index, so the union does not depend on which argument comes
// first: `one(id, dup)` and `one(dup, id)` are one instance. A print cannot show this, since two
// instances of one body print the same. The control binds `F` to two different sets (`{id}` and
// `{id, dup}`) and must build two, so a scan that stopped seeing a second instance cannot pass.
//
// Builds with `--names` and reads the name section for `one$1`, the second instance's name.
// GATING: needs the built binary and the seed; absent, the suite self-ignores.

import { COMPILER, exists, nativeEnv, VL } from "./support/tree.ts";

const ignore = !exists(VL) || !exists(COMPILER);
if (ignore) {
  console.warn("[shared-type-param-join] skipped — missing vl or the seed");
}

const HEAD = `function id<T>(x: T): T { x }
function dup<T>(x: T): T {
  print("dup")
  x
}
function one<F>(a: F, c: F, k: boolean) {
  let b = a
  if k { b = c }
  print(b(3) + 1)
  print(a("x"))
}
`;

// Whether `src`, built with names, holds a second instance of `one`.
const twoInstances = async (src: string): Promise<boolean> => {
  const dir = Deno.makeTempDirSync({ prefix: "vl-shared-join-" });
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
    const bytes = new TextDecoder("latin1").decode(Deno.readFileSync(out));
    return bytes.includes("one$1");
  } finally {
    Deno.removeSync(dir, { recursive: true });
  }
};

Deno.test({
  name: "shared type parameter: two generic arguments in either order are one instance",
  ignore,
  async fn() {
    const got = await twoInstances(
      HEAD + "one(id, dup, true)\none(dup, id, false)\n",
    );
    if (got) throw new Error("want one instance of `one`, got: a second (`one$1`)");
  },
});

Deno.test({
  name: "shared type parameter: control, two different joined sets are two instances",
  ignore,
  async fn() {
    const got = await twoInstances(
      HEAD + "one(id, dup, true)\none(id, id, true)\n",
    );
    if (!got) throw new Error("want a second instance `one$1`, got: one");
  },
});
