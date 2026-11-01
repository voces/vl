// A FUNCTION SET THAT IS NEVER CALLED THROUGH KEEPS THE CLOSURE REPRESENTATION — D3975.
//
// A set of un-annotated functions is lowered to an i32 member id only when a call goes through
// it, and that call then calls each member directly, at one call type or at several. A set that
// is only delivered to a declared function type, directly or out of a list, must cost
// exactly what it did before the id lowering existed. This pins that by building each such
// program against the same program with the selector's result annotated as a function type,
// which forces the closure, and requiring the two modules to be BYTE-IDENTICAL and to call
// through the table.
// Programs that call through the set are the controls: they must make no indirect call, or the
// check is not seeing the lowering.
//
// GATING: needs the built binary, the seed and binaryen (`node_modules`). A missing
// prerequisite self-ignores rather than fails, so read the suite's IGNORED COUNT.
//
// @test-timing native

import {
  binaryen,
  COMPILER,
  exists,
  nativeEnv,
  VL,
  wasmDis,
} from "./support/tree.ts";

const ENABLED = exists(VL) && exists(COMPILER) && exists(binaryen("wasm-dis"));
if (!ENABLED) {
  console.warn("[fn-set-rep] skipped — missing vl, the seed or binaryen");
}

const MEMBERS = [
  "function inc(a) { return a + 1 }",
  "function dbl(a) { return a * 2 }",
];
const sel = (annotated: boolean) => [
  annotated
    ? "function sel(c: boolean): (a: i32) => i32 {"
    : "function sel(c: boolean) {",
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
  storedInListDelivered: [
    "function ap(f: (x: i32) => i32, x: i32) { return f(x) }",
    "const fs = [sel(true), sel(false)]",
    "print(ap(fs[0], 3))",
  ],
};
// Called through the set at one type and at two; only the un-annotated spelling of the second
// type-checks. A call through a set calls each member directly whatever the call count or set
// size, and a call through a list element is a call through the set, so calledAtOneType and
// calledThroughListElement dispatch by design and are graded with the controls, not the bodies.
const CONTROLS: Record<string, string[]> = {
  calledAtOneType: ["const g = sel(false)", "print(g(3))"],
  calledAtTwoTypes: ["const g = sel(false)", "print(g(3))", "print(g(2.5))"],
  calledThroughListElement: [
    "const fs = [sel(true), sel(false)]",
    "print(fs[0](3))",
    "print(fs[1](3))",
  ],
};

const build = async (
  dir: string,
  name: string,
  lines: string[],
): Promise<Uint8Array> => {
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
    throw new Error(
      `vl build ${name} failed: ${new TextDecoder().decode(p.stderr)}`,
    );
  }
  return Deno.readFileSync(out);
};

const indirectCalls = async (dir: string, name: string): Promise<number> => {
  const p = await wasmDis([`${dir}/${name}.wasm`]);
  if (!p.success) throw new Error(`wasm-dis ${name} failed`);
  return new TextDecoder().decode(p.stdout).split(/call_indirect|call_ref/)
    .length - 1;
};

const sameBytes = (a: Uint8Array, b: Uint8Array): boolean =>
  a.length === b.length && a.every((x, i) => x === b[i]);

Deno.test({
  name:
    "fn-set rep: a set with no dispatching call is the closure its annotation forces",
  ignore: !ENABLED,
  fn: async () => {
    const dir = Deno.makeTempDirSync({ prefix: "vl-fn-set-rep-" });
    try {
      for (const [name, body] of Object.entries(BODIES)) {
        const bare = await build(dir, name, [
          ...MEMBERS,
          ...sel(false),
          ...body,
        ]);
        const ann = await build(dir, name + "Ann", [
          ...MEMBERS,
          ...sel(true),
          ...body,
        ]);
        if (!sameBytes(bare, ann)) {
          throw new Error(
            `${name}: want byte-identical modules, got ${bare.length} bytes against the ` +
              `annotated spelling's ${ann.length}`,
          );
        }
        if (await indirectCalls(dir, name) === 0) {
          throw new Error(
            `${name}: want a call through the closure, got no indirect call`,
          );
        }
      }
      for (const [name, body] of Object.entries(CONTROLS)) {
        await build(dir, name, [...MEMBERS, ...sel(false), ...body]);
        const n = await indirectCalls(dir, name);
        if (n !== 0) {
          throw new Error(
            `${name}: want a dispatch with no indirect call, got ${n}`,
          );
        }
      }
    } finally {
      Deno.removeSync(dir, { recursive: true });
    }
  },
});

// A set whose members' bodies yield no value is called through like any other: its list holds
// member ids, so the module needs no function table.
const VOID_MEMBERS: string[] = [
  "function inner<U>(u: U) { print(u) }",
  "function other<V>(v: V) { print(v) }",
  "function two() {",
  "  const fs = [inner, other]",
  "  fs[0](1)",
  "  fs[1](2.5)",
  "}",
  "two()",
];

Deno.test({
  name: "fn-set rep: a list of members that return nothing holds member ids",
  ignore: !ENABLED,
  fn: async () => {
    const dir = Deno.makeTempDirSync({ prefix: "vl-fn-set-rep-" });
    try {
      await build(dir, "voidMembers", VOID_MEMBERS);
      const p = await wasmDis([`${dir}/voidMembers.wasm`]);
      if (!p.success) throw new Error("wasm-dis voidMembers failed");
      const tables =
        new TextDecoder().decode(p.stdout).split("(table ").length - 1;
      if (tables !== 0) {
        throw new Error(`voidMembers: want no function table, got ${tables}`);
      }
    } finally {
      Deno.removeSync(dir, { recursive: true });
    }
  },
});

// A generic written into a list of another generic joins the list's set, so the list holds ids
// of both and no function is placed in a table.
const WRITTEN_GENERIC: string[] = [
  "function inner<U>(u: U) { print(u) }",
  "function other<V>(v: V) { print(v) }",
  "const gs = [inner]",
  "gs[0](3)",
  "const fs = [other]",
  "fs[0] = inner",
  "fs[0](true)",
];

Deno.test({
  name: "fn-set rep: a generic written into a list of generics joins its set",
  ignore: !ENABLED,
  fn: async () => {
    const dir = Deno.makeTempDirSync({ prefix: "vl-fn-set-rep-" });
    try {
      await build(dir, "writtenGeneric", WRITTEN_GENERIC);
      const p = await wasmDis([`${dir}/writtenGeneric.wasm`]);
      if (!p.success) throw new Error("wasm-dis writtenGeneric failed");
      const elems = new TextDecoder().decode(p.stdout).split("(elem ").length -
        1;
      if (elems !== 0) {
        throw new Error(`writtenGeneric: want no table elements, got ${elems}`);
      }
    } finally {
      Deno.removeSync(dir, { recursive: true });
    }
  },
});

// A list of a set built in a generic function's body is tagged like any other: each instance
// dispatches at its own tuple.
const IN_GENERIC_BODY: string[] = [
  "function inc(a) { return a + 1 }",
  "function dbl(a) { return a * 2 }",
  "function run<T>(v: T, n: i32) {",
  "  const fs = [inc, dbl]",
  "  print(fs[0](n) + fs[1](n))",
  "  v",
  "}",
  'run("s", 3)',
  "run(1.5, 4)",
];

Deno.test({
  name: "fn-set rep: a list of a set in a generic body holds member ids",
  ignore: !ENABLED,
  fn: async () => {
    const dir = Deno.makeTempDirSync({ prefix: "vl-fn-set-rep-" });
    try {
      await build(dir, "inGenericBody", IN_GENERIC_BODY);
      const p = await wasmDis([`${dir}/inGenericBody.wasm`]);
      if (!p.success) throw new Error("wasm-dis inGenericBody failed");
      const elems = new TextDecoder().decode(p.stdout).split("(elem ").length -
        1;
      if (elems !== 0) {
        throw new Error(`inGenericBody: want no table elements, got ${elems}`);
      }
    } finally {
      Deno.removeSync(dir, { recursive: true });
    }
  },
});

// So is one in a function with an un-annotated parameter, when no call through the set hands on a
// function.
const IN_HOLE_BODY: string[] = [
  "function inc(a) { return a + 1 }",
  "function dbl(a) { return a * 2 }",
  "function run(v, n: i32) {",
  "  const fs = [inc, dbl]",
  "  print(fs[0](n) + fs[1](n))",
  "  v",
  "}",
  'run("s", 3)',
  "run(1.5, 4)",
];

Deno.test({
  name:
    "fn-set rep: a list of a set in a hole function's body holds member ids",
  ignore: !ENABLED,
  fn: async () => {
    const dir = Deno.makeTempDirSync({ prefix: "vl-fn-set-rep-" });
    try {
      await build(dir, "inHoleBody", IN_HOLE_BODY);
      const p = await wasmDis([`${dir}/inHoleBody.wasm`]);
      if (!p.success) throw new Error("wasm-dis inHoleBody failed");
      const elems = new TextDecoder().decode(p.stdout).split("(elem ").length -
        1;
      if (elems !== 0) {
        throw new Error(`inHoleBody: want no table elements, got ${elems}`);
      }
    } finally {
      Deno.removeSync(dir, { recursive: true });
    }
  },
});

// A list of inner list literals of a set holds member ids at both levels.
const NESTED: string[] = [
  "function inc0(a) { return a + 1 }",
  "function dbl(a) { return a * 2 }",
  "const ws = [[inc0, dbl]]",
  "print(ws[0][1](3))",
  "print(ws[0][0](2.5))",
];

Deno.test({
  name: "fn-set rep: a list of lists of a set holds member ids",
  ignore: !ENABLED,
  fn: async () => {
    const dir = Deno.makeTempDirSync({ prefix: "vl-fn-set-rep-" });
    try {
      await build(dir, "nested", NESTED);
      const p = await wasmDis([`${dir}/nested.wasm`]);
      if (!p.success) throw new Error("wasm-dis nested failed");
      const elems = new TextDecoder().decode(p.stdout).split("(elem ").length -
        1;
      if (elems !== 0) {
        throw new Error(`nested: want no table elements, got ${elems}`);
      }
    } finally {
      Deno.removeSync(dir, { recursive: true });
    }
  },
});

// A record field holding a list of lists of a set holds member ids, read through a binding too.
const IN_RECORD: string[] = [
  "function inc0(a) { return a + 1 }",
  "function dbl(a) { return a * 2 }",
  "const r = { fs: [[inc0, dbl]] }",
  "const a = r.fs",
  "print(a[0][1](3))",
  "print(r.fs[0][0](2.5))",
];

Deno.test({
  name:
    "fn-set rep: a record field of lists of lists of a set holds member ids",
  ignore: !ENABLED,
  fn: async () => {
    const dir = Deno.makeTempDirSync({ prefix: "vl-fn-set-rep-" });
    try {
      await build(dir, "inRecord", IN_RECORD);
      const p = await wasmDis([`${dir}/inRecord.wasm`]);
      if (!p.success) throw new Error("wasm-dis inRecord failed");
      const elems = new TextDecoder().decode(p.stdout).split("(elem ").length -
        1;
      if (elems !== 0) {
        throw new Error(`inRecord: want no table elements, got ${elems}`);
      }
    } finally {
      Deno.removeSync(dir, { recursive: true });
    }
  },
});

// A map whose value is a list of lists of a set holds member ids, written by `set`, read narrowed.
const IN_MAP: string[] = [
  "function inc0(a) { return a + 1 }",
  "function dbl(a) { return a * 2 }",
  "const m = Map()",
  'm.set("k", [[inc0, dbl]])',
  'const y = m["k"]',
  "if y != null { print(y[0][1](5)) }",
];

Deno.test({
  name: "fn-set rep: a map of lists of lists of a set holds member ids",
  ignore: !ENABLED,
  fn: async () => {
    const dir = Deno.makeTempDirSync({ prefix: "vl-fn-set-rep-" });
    try {
      await build(dir, "inMap", IN_MAP);
      const p = await wasmDis([`${dir}/inMap.wasm`]);
      if (!p.success) throw new Error("wasm-dis inMap failed");
      const elems = new TextDecoder().decode(p.stdout).split("(elem ").length -
        1;
      if (elems !== 0) {
        throw new Error(`inMap: want no table elements, got ${elems}`);
      }
    } finally {
      Deno.removeSync(dir, { recursive: true });
    }
  },
});

// A list of lists whose first inner list holds fewer members of a set still holds member ids.
const FEWER_FIRST: string[] = [
  "function inc0(a) { return a + 1 }",
  "function dbl(a) { return a * 2 }",
  "const fs = [[inc0], [inc0, dbl]]",
  "print(fs[1][1](3))",
  "print(fs[0][0](2.5))",
];

Deno.test({
  name:
    "fn-set rep: a list of lists of a set with fewer members first holds member ids",
  ignore: !ENABLED,
  fn: async () => {
    const dir = Deno.makeTempDirSync({ prefix: "vl-fn-set-rep-" });
    try {
      await build(dir, "fewerFirst", FEWER_FIRST);
      const p = await wasmDis([`${dir}/fewerFirst.wasm`]);
      if (!p.success) throw new Error("wasm-dis fewerFirst failed");
      const elems = new TextDecoder().decode(p.stdout).split("(elem ").length -
        1;
      if (elems !== 0) {
        throw new Error(`fewerFirst: want no table elements, got ${elems}`);
      }
    } finally {
      Deno.removeSync(dir, { recursive: true });
    }
  },
});

// A list of lists of a set handed to an un-annotated parameter and called through its elements at
// two types holds member ids (D14727).
const HANDED: string[] = [
  "function inc0(a) { return a + 1 }",
  "function dbl(a) { return a * 2 }",
  "function take(v) { print(v[0][0](3)); print(v[0][1](2.5)) }",
  "take([[inc0, dbl]])",
];

Deno.test({
  name:
    "fn-set rep: a list of lists of a set handed to a hole parameter holds member ids",
  ignore: !ENABLED,
  fn: async () => {
    const dir = Deno.makeTempDirSync({ prefix: "vl-fn-set-rep-" });
    try {
      await build(dir, "handed", HANDED);
      const p = await wasmDis([`${dir}/handed.wasm`]);
      if (!p.success) throw new Error("wasm-dis handed failed");
      const elems = new TextDecoder().decode(p.stdout).split("(elem ").length -
        1;
      if (elems !== 0) {
        throw new Error(`handed: want no table elements, got ${elems}`);
      }
    } finally {
      Deno.removeSync(dir, { recursive: true });
    }
  },
});

// A lambda handed to an un-annotated parameter and called there at two types is a member of the
// set, called by its declaration rather than through a closure.
const LAMBDA_MEMBER: string[] = [
  "function lap(f) { print(f(3)); print(f(2.5)) }",
  "lap((a) => a)",
];

Deno.test({
  name: "fn-set rep: a lambda handed to a hole parameter is a member id",
  ignore: !ENABLED,
  fn: async () => {
    const dir = Deno.makeTempDirSync({ prefix: "vl-fn-set-rep-" });
    try {
      await build(dir, "lambda", LAMBDA_MEMBER);
      const p = await wasmDis([`${dir}/lambda.wasm`]);
      if (!p.success) throw new Error("wasm-dis lambda failed");
      const elems = new TextDecoder().decode(p.stdout).split("(elem ").length -
        1;
      if (elems !== 0) {
        throw new Error(`lambda: want no table elements, got ${elems}`);
      }
    } finally {
      Deno.removeSync(dir, { recursive: true });
    }
  },
});
